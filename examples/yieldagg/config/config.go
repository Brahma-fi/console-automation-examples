package config

import (
	"context"
	"log"

	"github.com/sethvargo/go-envconfig"
)

type Config struct {
	ExecutorKey    string `env:"EXECUTOR_KEY"`
	BaseRpcURL     string `env:"BASE_RPC_URL"`
	MorphoBaseURL  string `env:"MORPHO_BASE_URL"`
	ConsoleBaseURL string `env:"CONSOLE_BASE_URL"`
}

func LoadConfig(ctx context.Context) (*Config, error) {
	c := &Config{}
	if err := envconfig.Process(ctx, c); err != nil {
		log.Fatal(err)
	}

	return c, nil
}
