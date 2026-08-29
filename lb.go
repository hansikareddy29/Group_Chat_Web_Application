package main

import (
	"crypto/tls"
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
	URL      *url.URL
	Alive    atomic.Bool
	Proxy    *httputil.ReverseProxy
}

type LoadBalancer struct {
	backends []*Backend
	next     atomic.Uint64
}

func (lb *LoadBalancer) nextBackend() *Backend {
	n := len(lb.backends)
	for i := 0; i < n; i++ {
		index := lb.next.Add(1) % uint64(n)
		b := lb.backends[index]
		if b.Alive.Load() {
			return b
		}
	}
	return nil
}

func main() {
	backendList := flag.String("backends", "https://172.17.0.51:3000,https://172.17.0.52:3000,https://172.17.0.53:3000", "Comma separated backends")
	port := flag.String("port", "3000", "LB port")
	flag.Parse()

	// Setup Transport to ignore self-signed certs
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	lb := &LoadBalancer{}
	for _, bStr := range strings.Split(*backendList, ",") {
		u, _ := url.Parse(strings.TrimSpace(bStr))
		proxy := httputil.NewSingleHostReverseProxy(u)
		proxy.Transport = transport

		backend := &Backend{URL: u, Proxy: proxy}
		backend.Alive.Store(true)
		lb.backends = append(lb.backends, backend)
	}

	// Health Check Loop
	go func() {
		client := &http.Client{Timeout: 2 * time.Second, Transport: transport}
		for {
			for _, b := range lb.backends {
				res, err := client.Get(b.URL.String() + "/health")
				b.Alive.Store(err == nil && res.StatusCode == http.StatusOK)
			}
			time.Sleep(2 * time.Second)
		}
	}()

	fmt.Printf("LB started at :%s (External :3249)\n", *port)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		peer := lb.nextBackend()
		if peer != nil {
			peer.Proxy.ServeHTTP(w, r)
			return
		}
		http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
	})

	log.Fatal(http.ListenAndServe(":"+*port, nil))
}
