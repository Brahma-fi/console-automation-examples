package integrations

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	"github.com/ethereum/go-ethereum/common"
	"github.com/go-resty/resty/v2"
)

const (
	CancelledStatus = 4
)

type ConsoleClient struct {
	client *resty.Client
}

func NewConsoleClient(base string) *ConsoleClient {
	return &ConsoleClient{
		client: resty.New().SetBaseURL(base),
	}
}

func (c *ConsoleClient) ExecutorByAddress(
	ctx context.Context,
	address common.Address,
	chainID uint64,
) (*entity.ExecutorMetadata, error) {
	result := &entity.GetExecutorMetadataResp{}
	resp, err := c.client.R().
		SetContext(ctx).
		SetResult(result).
		Get(fmt.Sprintf("/v1/automations/executor/%s/%d", address.Hex(), chainID))
	switch {
	case err != nil:
		return nil, fmt.Errorf("failed to fetch executor by address: %w", err)
	case resp.StatusCode() == http.StatusNotFound:
		return nil, fmt.Errorf("executor not found: %s", address.Hex())
	case resp.StatusCode() != http.StatusOK:
		return nil, fmt.Errorf("failed to fetch executor: %d", resp.StatusCode())
	}

	return &result.Data, nil
}

func (c *ConsoleClient) ActiveSubscriptions(
	ctx context.Context,
	registryID string,
) ([]entity.ClientSubscription, error) {
	subscriptions, err := c.Subscriptions(ctx, registryID)
	if err != nil {
		return nil, err
	}

	var activeSubscriptions []entity.ClientSubscription
	for _, subscription := range subscriptions {
		if subscription.Status != CancelledStatus {
			activeSubscriptions = append(activeSubscriptions, subscription)
		}
	}

	return activeSubscriptions, nil
}

func (c *ConsoleClient) Subscriptions(ctx context.Context, registryID string) ([]entity.ClientSubscription, error) {
	result := &entity.GetClientSubscriptionsResp{}
	_, err := c.client.R().
		SetContext(ctx).
		SetResult(result).
		Get(fmt.Sprintf("/v1/automations/executor/%s/subscriptions", registryID))

	if err != nil {
		return nil, fmt.Errorf("failed to get executor subscriptions: %w", err)
	}

	return result.Data, nil
}

func (c *ConsoleClient) Execute(ctx context.Context, req *entity.ExecuteTaskReq) (*entity.ExecuteTaskResp, error) {
	result := &entity.ExecuteTaskResp{}
	_, err := c.client.R().
		SetContext(ctx).
		SetBody(req).
		SetResult(result).
		Post(fmt.Sprintf("/v1/automations/tasks/execute/%d", req.ChainID))

	if err != nil {
		return nil, fmt.Errorf("failed to get executor subscriptions: %w", err)
	}

	return result, nil
}
