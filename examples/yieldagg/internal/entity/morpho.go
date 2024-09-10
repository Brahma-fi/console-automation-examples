package entity

import "github.com/shurcooL/graphql"

type VaultInfo struct {
	Id       string `json:"id"`
	Address  string `json:"address"`
	Symbol   string `json:"symbol"`
	Metadata struct {
		Description string `json:"description"`
		Image       string `json:"image"`
	} `json:"metadata"`
	Asset struct {
		Chain struct {
			Id int `json:"id"`
		} `json:"chain"`
		Decimals int    `json:"decimals"`
		Address  string `json:"address"`
	} `json:"asset"`
	State struct {
		Apy    float64 `json:"apy"`
		NetApy float64 `json:"netApy"`
	} `json:"state"`
}

type VaultQuery struct {
	Vaults struct {
		Items []struct {
			ID       graphql.String
			Address  graphql.String
			Symbol   graphql.String
			Metadata struct {
				Description graphql.String
				Image       graphql.String
			}
			Asset struct {
				Chain struct {
					ID graphql.Int
				}
				Decimals graphql.Int
				Address  graphql.String
			}
			State struct {
				APY    graphql.Float
				NetAPY graphql.Float
			}
		}
	} `graphql:"vaults(where:{ assetAddress_in: $asset, chainId_in: $chainID, whitelisted: true})"`
}

func (q *VaultQuery) ToVaultInfo() []VaultInfo {
	var vaultInfos []VaultInfo

	for _, item := range q.Vaults.Items {
		vaultInfo := VaultInfo{
			Id:      string(item.ID),
			Address: string(item.Address),
			Symbol:  string(item.Symbol),
			Metadata: struct {
				Description string `json:"description"`
				Image       string `json:"image"`
			}{
				Description: string(item.Metadata.Description),
				Image:       string(item.Metadata.Image),
			},
			Asset: struct {
				Chain struct {
					Id int `json:"id"`
				} `json:"chain"`
				Decimals int    `json:"decimals"`
				Address  string `json:"address"`
			}{
				Chain: struct {
					Id int `json:"id"`
				}{
					Id: int(item.Asset.Chain.ID),
				},
				Decimals: int(item.Asset.Decimals),
				Address:  string(item.Asset.Address),
			},
			State: struct {
				Apy    float64 `json:"apy"`
				NetApy float64 `json:"netApy"`
			}{
				Apy:    float64(item.State.APY),
				NetApy: float64(item.State.NetAPY),
			},
		}
		vaultInfos = append(vaultInfos, vaultInfo)
	}

	return vaultInfos
}

type UserQuery struct {
	Users struct {
		Items []struct {
			VaultPositions []struct {
				ID        graphql.String
				AssetsUsd graphql.Float
				Vault     struct {
					Address graphql.String
					ID      graphql.String
					Symbol  graphql.String
				}
			}
		}
	} `graphql:"users(where: { address_in : $address})"`
}

type UserInfo struct {
	VaultPositions []VaultPosition
}

type VaultPosition struct {
	ID        string
	AssetsUsd float64
	Vault     VaultBasicInfo
}

type VaultBasicInfo struct {
	Address string
	ID      string
	Symbol  string
}

func (q *UserQuery) ToUserInfo() []UserInfo {
	var userInfos []UserInfo

	for _, item := range q.Users.Items {
		userInfo := UserInfo{
			VaultPositions: make([]VaultPosition, len(item.VaultPositions)),
		}

		for i, position := range item.VaultPositions {
			userInfo.VaultPositions[i] = VaultPosition{
				ID:        string(position.ID),
				AssetsUsd: float64(position.AssetsUsd),
				Vault: VaultBasicInfo{
					Address: string(position.Vault.Address),
					ID:      string(position.Vault.ID),
					Symbol:  string(position.Vault.Symbol),
				},
			}
		}

		userInfos = append(userInfos, userInfo)
	}

	return userInfos
}
