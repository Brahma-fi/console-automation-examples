import Axios from "axios";
import { EXECUTOR_PLUGIN_ABI } from "./abis/executorPlugin.js";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const EXECUTOR_PLUGIN_ADDRESS = "0xb92929d03768a4F8D69552e15a8071EAf8E684ed";
const CANCELLED_STATUS = 4;
const SVC_BASE_URL = process.env.API_BASE_URL;

const fetchExecutorByAddress = async (address, chainId) => {
  try {
    const resp = await Axios.get(
      `${SVC_BASE_URL}/v1/automations/executor/${address}/${chainId}`
    );
    return resp.data.data;
  } catch (err) {
    console.log("err: failed to call fetchExecutorByAddress");
    throw "failed to fetch executor by address";
  }
};

const fetchActiveSubscriptions = async (registryID) => {
  try {
    const data = await Axios.get(
      `${SVC_BASE_URL}/v1/automations/executor/${registryID}/subscriptions`
    );

    const subscriptions = data.data.data;

    let activeSubscriptions = [];
    for (let subscription of subscriptions) {
      if (subscription.status != CANCELLED_STATUS) {
        activeSubscriptions.push(subscription);
      }
    }

    return activeSubscriptions;
  } catch (err) {
    console.log("err: failed to get subscriptions");
    throw "failed to get executor subscriptions";
  }
};

const buildExecutionDigestSignature = async (
  chainId,
  to,
  value,
  data,
  operation,
  account,
  nonce,
  wallet,
  executor
) => {
  const types = {
    ExecutionParams: [
      { name: "operation", type: "uint8" },
      { name: "to", type: "address" },
      { name: "account", type: "address" },
      { name: "executor", type: "address" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  };

  const executorPluginDomain = {
    name: "ExecutorPlugin",
    version: "1.0",
    chainId: chainId,
    verifyingContract: EXECUTOR_PLUGIN_ADDRESS,
  };

  const executionParamsData = {
    to,
    value,
    data,
    operation,
    account,
    executor: executor,
    nonce,
    gasToken: ethers.constants.AddressZero,
    refundReceiver: ethers.constants.AddressZero,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
  };

  const signature = await wallet._signTypedData(
    executorPluginDomain,
    types,
    executionParamsData
  );

  return signature;
};

const signCallData = async (
  account,
  executor,
  executable,
  wallet,
  chainId,
  rpc
) => {
  const provider = new ethers.providers.JsonRpcProvider(rpc);

  const executorPluginContract = new ethers.Contract(
    EXECUTOR_PLUGIN_ADDRESS,
    EXECUTOR_PLUGIN_ABI,
    provider
  );
  /// Generate signature for execution digest
  const executorSignature = await buildExecutionDigestSignature(
    chainId,
    executable.to,
    executable.value,
    executable.data,
    executable.callType,
    account,
    (await executorPluginContract.executorNonce(account, executor)).toString(),
    wallet,
    executor
  );

  return executorSignature;
};

const executeTask = async ({
  chainId,
  executable,
  subaccount,
  executorSignature,
  executor,
}) => {
  try {
    const { data: relayerResponse } = await Axios.post(
      `${SVC_BASE_URL}/v1/automations/tasks/execute/${chainId}`,
      {
        task: {
          executable,
          subaccount,
          executorSignature,
          executor,
        },
      },
      {
        timeout: 50 * 1000,
      }
    );
    return relayerResponse;
  } catch (err) {
    console.log("failed to execute task ");
    throw "failed to execute task";
  }
};

export {
  fetchExecutorByAddress,
  buildExecutionDigestSignature,
  signCallData,
  fetchActiveSubscriptions,
  executeTask,
};
