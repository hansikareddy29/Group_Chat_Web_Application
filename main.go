package main

import (
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Backend struct {
	URL      *url.URL
	Alive    atomic.Bool
}

type Metrics struct {
	Total     atomic.Uint64
	LatencyMu sync.Mutex
	Latencies []time.Duration
}

type LoadBalancer struct {
	backends []*Backend
	next     atomic.Uint64
	metrics  Metrics
}

func (lb *LoadBalancer) nextBackend() *Backend {
	n := len(lb.backends)
	if n == 0 { return nil }
	start := int(lb.next.Add(1)-1) % n
	for i := 0; i < n; i++ {
		b := lb.backends[(start+i)%n]
		if b.Alive.Load() { return b }
	}
	return nil
}

func main() {
	// 1. Define all the flags
	port := flag.Int("port", 3000, "Load balancer port")
	rawBackends := flag.String("backends", "https://172.17.0.51:3000,https://172.17.0.52:3000,https://172.17.0.53:3000", "Backend URLs")
	tlsEnabled := flag.Bool("tls", false, "Enable HTTPS")
	certFile := flag.String("cert", "cert.pem", "TLS certificate")
	keyFile := flag.String("key", "key.pem", "TLS key")
	flag.Parse()

	lb := &LoadBalancer{}
	for _, raw := range strings.Split(*rawBackends, ",") {
		u, err := url.Parse(strings.TrimSpace(raw))
		if err != nil { log.Fatalf("Invalid URL: %v", err) }
		b := &Backend{URL: u}
		b.Alive.Store(true)
		lb.backends = append(lb.backends, b)
	}

	// Health Check
	go func() {
		client := &http.Client{
			Timeout: 2 * time.Second,
			Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
		}
		for {
			for _, b := range lb.backends {
				resp, err := client.Get(b.URL.String() + "/health")
				b.Alive.Store(err == nil && resp.StatusCode == http.StatusOK)
				if resp != nil { resp.Body.Close() }
			}
			time.Sleep(5 * time.Second)
		}
	}()

	// Proxy Handler
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    lb.metrics.Total.Add(1)
    backend := lb.nextBackend()
    if backend == nil {
        http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
        return
    }

    proxy := httputil.NewSingleHostReverseProxy(backend.URL)
    
  
    proxy.FlushInterval = -1 
    
    proxy.Transport = &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    }

  
    r.Header.Set("X-Forwarded-Proto", "https")
    r.Header.Set("X-Forwarded-Host", r.Host)

    proxy.ServeHTTP(w, r)
})

	// Metrics Handler
	http.HandleFunc("/lb/metrics", func(w http.ResponseWriter, r *http.Request) {
		lb.metrics.LatencyMu.Lock()
		lats := append([]time.Duration(nil), lb.metrics.Latencies...)
		lb.metrics.LatencyMu.Unlock()
		sort.Slice(lats, func(i, j int) bool { return lats[i] < lats[j] })

		res := map[string]any{"total": lb.metrics.Total.Load()}
		if len(lats) > 0 {
			res["p95_ms"] = lats[int(float64(len(lats))*0.95)].Milliseconds()
		}
		json.NewEncoder(w).Encode(res)
	})

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	if *tlsEnabled {
		log.Printf("LB running on HTTPS %s", addr)
		log.Fatal(http.ListenAndServeTLS(addr, *certFile, *keyFile, nil))
	} else {
		log.Printf("LB running on HTTP %s", addr)
		log.Fatal(http.ListenAndServe(addr, nil))
	}
}
