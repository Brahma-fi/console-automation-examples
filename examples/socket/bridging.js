import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.SOCKET_API_KEY || "";

async function getQuote(
  fromChainId,
  fromTokenAddress,
  toChainId,
  toTokenAddress,
  fromAmount,
  senderAddress,
  recipient,
  uniqueRoutesPerBridge,
  sort,
  singleTxOnly
) {
  const response = await fetch(
    `https://api.socket.tech/v2/quote?fromChainId=${fromChainId}&fromTokenAddress=${fromTokenAddress}&toChainId=${toChainId}&toTokenAddress=${toTokenAddress}&fromAmount=${fromAmount}&userAddress=${senderAddress}&recipient=${recipient}&bridgeWithGas=false&sort=${sort}&singleTxOnly=${singleTxOnly}&isContractCall=true`,
    {
      method: "GET",
      headers: {
        "API-KEY": API_KEY,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    }
  );

  const json = await response.json();
  return json;
}

async function getRouteTransactionData(route) {
  const response = await fetch("https://api.socket.tech/v2/build-tx", {
    method: "POST",
    headers: {
      "API-KEY": API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ route: route }),
  });

  const json = await response.json();
  return json;
}

export { getQuote, getRouteTransactionData };
