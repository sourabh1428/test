package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

func trackHandler(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	log.Printf("Email opened by: %s\n", email)

	// Return a 1x1 transparent GIF
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
		port = "10000" // Default port
	}

	// Log the start
	log.Printf("Server starting on port %s...\n", port)

	// Start server on 0.0.0.0 and the port from the environment
	err := http.ListenAndServe("0.0.0.0:"+port, nil)
	if err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
