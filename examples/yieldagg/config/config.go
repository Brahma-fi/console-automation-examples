package config

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/joho/godotenv"
	"github.com/sethvargo/go-envconfig"
)

const (
	BaseChainID           = 8453
	SafeMultiSendCallOnly = "0x40a2accbd92bca938b02010e17a5b8929b49130d"
)

var (
	SafeMultiSendABI, _ = abi.JSON(strings.NewReader(`
		[
		  {
			"inputs": [
			  {
				"internalType": "bytes",
				"name": "transactions",
				"type": "bytes"
			  }
			],
			"name": "multiSend",
			"outputs": [],
			"stateMutability": "payable",
			"type": "function"
		  }
		]
	`))
)

type Config struct {
	ExecutorKey    string `env:"EXECUTOR_KEY"`
	BaseRpcURL     string `env:"BASE_RPC_URL"`
	MorphoBaseURL  string `env:"MORPHO_BASE_URL"`
	ConsoleBaseURL string `env:"CONSOLE_BASE_URL"`
}

func LoadConfig(ctx context.Context) (*Config, error) {
	c := &Config{}
	if check := os.Getenv("EXECUTOR_KEY"); check == "" {
		if err := godotenv.Load(); err != nil {
			return nil, err
		}
	}

	if err := envconfig.Process(ctx, c); err != nil {
		log.Fatal(err)
	}

	return c, nil
}
