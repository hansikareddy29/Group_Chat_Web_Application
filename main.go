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
	"strings"
	"sync/atomic"
	"time"
)

type Backend struct {
	URL            *url.URL
	Alive          atomic.Bool
	FailCount      atomic.Int32
	ActiveRequests atomic.Int64
	Proxy          *httputil.ReverseProxy
}

type LoadBalancer struct {
	backends  []*Backend
	counter   atomic.Uint64
	threshold int64
}

func (lb *LoadBalancer) selectBackend() *Backend {
	n := len(lb.backends)
	if n == 0 {
		return nil
	}
	start := int(lb.counter.Add(1) % uint64(n))
	var best *Backend
	var minLoad int64 = 1<<62 - 1
	for i := 0; i < n; i++ {
		idx := (start + i) % n
		b := lb.backends[idx]
		if !b.Alive.Load() {
			continue
		}
		load := b.ActiveRequests.Load()
		if load < lb.threshold && load < minLoad {
			minLoad = load
			best = b
			if load == 0 {
				return b
			}
		}
	}
	if best != nil {
		return best
	}
	for i := 0; i < n; i++ {
		idx := (start + i) % n
		b := lb.backends[idx]
		if !b.Alive.Load() {
			continue
		}
		load := b.ActiveRequests.Load()
		if load < minLoad {
			minLoad = load
			best = b
		}
	}
	if best != nil {
		return best
	}
	for i := 0; i < n; i++ {
		idx := (start + i) % n
		if lb.backends[idx].Alive.Load() {
			return lb.backends[idx]
		}
	}
	return lb.backends[0]
}

func main() {
	port := flag.Int("port", 3000, "Load balancer port")
	rawBackends := flag.String("backends", "https://172.17.0.51:3000,https://172.17.0.52:3000,https://172.17.0.53:3000", "Backend URLs")
	threshold := flag.Int64("threshold", 25, "Active request threshold")
	tlsEnabled := flag.Bool("tls", false, "Enable HTTPS")
	flag.Parse()

	sharedTransport := &http.Transport{
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		MaxIdleConns:        50000,
		MaxIdleConnsPerHost: 10000,
		MaxConnsPerHost:     10000,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  true,
		ForceAttemptHTTP2:   false,
	}

	lb := &LoadBalancer{threshold: *threshold}
	for _, raw := range strings.Split(*rawBackends, ",") {
		u, err := url.Parse(strings.TrimSpace(raw))
		if err != nil {
			log.Fatalf("Invalid backend URL: %v", err)
		}
		proxy := httputil.NewSingleHostReverseProxy(u)
		proxy.Transport = sharedTransport
		proxy.FlushInterval = -1
		b := &Backend{URL: u, Proxy: proxy}
		b.Alive.Store(true)
		lb.backends = append(lb.backends, b)
	}

	go func() {
		client := &http.Client{Timeout: 5 * time.Second, Transport: sharedTransport}
		for {
			for _, b := range lb.backends {
				resp, err := client.Get(b.URL.String() + "/health")
				if err == nil && resp.StatusCode == http.StatusOK {
					b.FailCount.Store(0)
					b.Alive.Store(true)
				} else {
					if b.FailCount.Add(1) >= 3 {
						b.Alive.Store(false)
					}
				}
				if resp != nil {
					resp.Body.Close()
				}
			}
			time.Sleep(2 * time.Second)
		}
	}()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	http.HandleFunc("/lb/metrics", func(w http.ResponseWriter, r *http.Request) {
		stats := make([]map[string]any, 0)
		for _, b := range lb.backends {
			stats = append(stats, map[string]any{
				"url":             b.URL.String(),
				"alive":           b.Alive.Load(),
				"active_requests": b.ActiveRequests.Load(),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"threshold": lb.threshold,
			"backends":  stats,
		})
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		backend := lb.selectBackend()
		backend.ActiveRequests.Add(1)
		defer backend.ActiveRequests.Add(-1)
		r.Header.Set("X-Forwarded-Proto", "https")
		r.Header.Set("X-Forwarded-Host", r.Host)
		backend.Proxy.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	log.Printf("LB running on %s", addr)
	if *tlsEnabled {
		log.Fatal(http.ListenAndServeTLS(addr, "cert.pem", "key.pem", nil))
	} else {
		log.Fatal(http.ListenAndServe(addr, nil))
	}
}
