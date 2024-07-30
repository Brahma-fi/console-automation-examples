import dotenv from "dotenv";
import { Wallet, providers, BigNumber } from "ethers";
dotenv.config();

const EXECUTOR_SIGNING_KEY = process.env.EXECUTOR_SIGNING_KEY || "";
const CHAIN_ID_2_RPC_URL = JSON.parse(process.env.CHAIN_ID_2_RPC_URL) || "";

import {
  fetchExecutorByAddress,
  fetchActiveSubscriptions,
  signCallData,
  executeTask,
} from "./console/helpers.js";

import { getQuote, getRouteTransactionData } from "./socket/bridging.js";

const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const BASE_CHAIN_ID = 42161;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const second = 1000;

const canExecute = async (targetChainID, target, threshold) => {
  const provider = new providers.JsonRpcProvider(
    CHAIN_ID_2_RPC_URL[`${targetChainID}`]
  );

  const bal = await provider.getBalance(target);
  console.log(
    "canExecute current: ",
    bal.toString(),
    "threshold: ",
    threshold.toString()
  );

  if (bal.gt(threshold)) {
    return false;
  }

  return true;
};

const main = async () => {
  try {
    const metadata = await fetchExecutorByAddress(
      EXECUTOR_ADDRESS,
      BASE_CHAIN_ID
    );
    console.log("FETCHED EXECUTOR METADATA: ", metadata);

    const provider = new providers.JsonRpcProvider(
      CHAIN_ID_2_RPC_URL[`${BASE_CHAIN_ID}`]
    );
    const signer = new Wallet(EXECUTOR_SIGNING_KEY, provider);

    let subscriptions = [];
    while (true) {
      console.log("FETCHING SUBSCRIPTIONS....");
      subscriptions = await fetchActiveSubscriptions(metadata.id);
      if (subscriptions.length > 0) {
        break;
      }

      await delay(5 * second);
    }

    while (true) {
      console.log("FOUND SUBSCRIPTIONS", subscriptions);

      for (let subscription of subscriptions) {
        const metadata = subscription.metadata;
        let refuel = false;
        let targetChainID = 0;
        let subaccount = subscription.subAccountAddress;
        for (let targetChain of metadata.chains) {
          if (
            await canExecute(
              targetChain,
              metadata.refuelAddress,
              metadata.minAmount
            )
          ) {
            refuel = true;
            targetChainID = targetChain;
            break;
          }
        }
        if (refuel) {
          console.log("GENERATING BRIDGING QUOTE: ");
          const quote = await getQuote(
            BASE_CHAIN_ID,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            targetChainID,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            metadata.amount,
            subaccount,
            metadata.refuelAddress,
            true,
            "time",
            true
          );

          const route = quote.result.routes[0];
          console.log("QUOTE:", route);

          const apiReturnData = await getRouteTransactionData(route);
          console.log("CALLDATA:", apiReturnData);

          const executable = {
            callType: 0,
            to: apiReturnData.result.txTarget,
            value: BigNumber.from(apiReturnData.result.value).toString(),
            data: apiReturnData.result.txData,
          };

          const executorSignature = await signCallData(
            subaccount,
            EXECUTOR_ADDRESS,
            executable,
            signer,
            BASE_CHAIN_ID,
            CHAIN_ID_2_RPC_URL[`${BASE_CHAIN_ID}`]
          );
          console.log("EXECUTOR_SIG: ", executorSignature);

          const taskExecResponse = await executeTask({
            chainId: BASE_CHAIN_ID,
            executable,
            subaccount,
            executorSignature,
            executor: EXECUTOR_ADDRESS,
          });

          console.log("EXECUTED TASK: ", taskExecResponse);
          await delay(70 * second);
        } else {
          await delay(5 * second);
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

main();
