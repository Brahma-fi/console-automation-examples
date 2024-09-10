const ethers = require("ethers");

const msgParams = {
  domain: {
    chainId: 8453,
  },
  message: {
    timestamp: 1,
    executor: process.env.EXECUTOR_ADDRESS,
    inputTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
    hopAddresses: [
      "0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61",
      "0xdB90A4e973B7663ce0Ccc32B6FbD37ffb19BfA83",
      "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
      "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12",
      "0x12AFDeFb2237a5963e7BAb3e2D46ad0eee70406e",
      "0x0FaBfEAcedf47e890c50C8120177fff69C6a1d9B",
    ],
    feeInBPS: 0,
    feeToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    feeReceiver: process.env.EXECUTOR_ADDRESS,
    limitPerExecution: false,
    clientId: "morpho-rebalancing",
  },
  primaryType: "RegisterExecutor",
  types: {
    RegisterExecutor: [
      { name: "timestamp", type: "uint256" },
      { name: "executor", type: "address" },
      { name: "inputTokens", type: "address[]" },
      { name: "hopAddresses", type: "address[]" },
      { name: "feeInBPS", type: "uint256" },
      { name: "feeToken", type: "address" },
      { name: "feeReceiver", type: "address" },
      { name: "limitPerExecution", type: "bool" },
      { name: "clientId", type: "string" },
    ],
  },
};

const RPC_URL = "https://base.llamarpc.com";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const privateKey = process.env.EXECUTOR_PK;
const wallet = new ethers.Wallet(privateKey, provider);

async function signAutomationRegistrationMessage() {
  try {
    const signature = await wallet._signTypedData(
      msgParams.domain,
      msgParams.types,
      msgParams.message
    );
    return signature;
  } catch (err) {
    console.error("Error signing message:", err);
    throw err;
  }
}

async function registerExecutor(signature) {
  const axios = require('axios');
  const data = {
    config: {
      inputTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
      hopAddresses: [
        "0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61",
        "0xdB90A4e973B7663ce0Ccc32B6FbD37ffb19BfA83",
        "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
        "0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12",
        "0x12AFDeFb2237a5963e7BAb3e2D46ad0eee70406e",
        "0x0FaBfEAcedf47e890c50C8120177fff69C6a1d9B"
      ],
      feeInBPS: 0,
      feeToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      feeReceiver: process.env.EXECUTOR_ADDRESS,
      limitPerExecution: false
    },
    executor: process.env.EXECUTOR_ADDRESS,
    signature: signature,
    chainId: 8453,
    timestamp: 1,
    executorMetadata: {
      id: "morpho-rebalancing",
      name: "auto~morpho",
      logo: "https://brand.morpho.org/_next/static/media/morpho-logo-symbol-white.79a51ba6.svg",
      metadata: {}
    }
  };

  try {
    const response = await axios.post(`${process.env.CONSOLE_BASE_URL}/v1/automations/executor`, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('API Response:', response.data);
  } catch (error) {
    console.error('Error calling API:', error.response ? error.response.data : error.message);
  }
}

async function main() {
  try {
    const signature = await signAutomationRegistrationMessage();
    console.log("Signature:", signature);
    await registerExecutor(signature);
  } catch (err) {
    console.error("Error in main function:", err);
  }
}

main();