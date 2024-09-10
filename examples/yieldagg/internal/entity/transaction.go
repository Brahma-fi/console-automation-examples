package entity

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
)

type Transaction struct {
	Target common.Address `json:"to"`
	Val    *big.Int       `json:"value"`
	Data   string         `json:"data"`
}

func (t *Transaction) From() common.Address {
	return common.HexToAddress("")
}

func (t *Transaction) To() common.Address {
	return t.Target
}
func (t *Transaction) CallData() string {
	return t.Data
}
func (t *Transaction) Value() *big.Int {
	return t.Val
}
func (t *Transaction) Operation() uint8 {
	// Call Only
	return 0
}
