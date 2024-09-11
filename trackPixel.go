package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"time"
)

func trackHandler(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	log.Printf("Email opened by: %s at %s\n", email, time.Now().Format(time.RFC3339))

	pixel, err := ioutil.ReadFile("transparent.gif")
	if err != nil {
		http.Error(w, "Error loading pixel", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pixel)))
	w.Write(pixel)
}

func main() {
	http.HandleFunc("/track", trackHandler)

	// Get the port from the environment variable
	port := os.Getenv("PORT")
	if port == "" {
		port = "10000" // Default to port 10000 if PORT is not set
	}

	log.Printf("Server starting on port %s...\n", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil)) // Bind to 0.0.0.0 to listen on all interfaces
}
