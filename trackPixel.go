package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"time"
)

// Tracking handler
func trackHandler(w http.ResponseWriter, r *http.Request) {
	// Get the email query parameter
	email := r.URL.Query().Get("email")

	// Log the email open
	log.Printf("TRACKING\n")
	log.Printf("Email opened by: %s at %s\n", email, time.Now().Format(time.RFC3339))

	// Read the transparent.gif file
	pixel, err := ioutil.ReadFile("transparent.gif")
	if err != nil {
		http.Error(w, "Error loading pixel", http.StatusInternalServerError)
		return
	}

	// Set response headers
	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pixel)))

	// Write the pixel to the response
	w.Write(pixel)
}

func main() {
	// Set up the track route
	http.HandleFunc("/track", trackHandler)

	// Start the server
	port := ":3000"
	log.Printf("Tracking server is running on port %s\n", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
