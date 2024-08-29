package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func NewLogger(service string) *zap.Logger {
	config := zap.NewDevelopmentConfig()
	config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	config.InitialFields = map[string]interface{}{
		"service": service,
	}
	logger, _ := config.Build()
	return logger
}
