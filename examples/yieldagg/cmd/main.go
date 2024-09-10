package main

import (
	"log"

	"github.com/Brahma-fi/console-automation-examples/internal/app"
)

func main() {
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
