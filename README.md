# Execution API

### Introduction

Console V2 provides access control to its users by providing the ability to securely and with minimal trust, delegate the handling of funds to another set of operators. This is done so by setting up a sub-safe with the said set of operators/delegatees and then allocating funds, and setting up policies to secure it. This allows the delegatees to perform any actions with the funds allocated as long as they are abiding by the policies set up by the main console account.

However, these delegatees are a multisig, and thus any action needed to be performed by one of them must be signed off by everyone else and this is slow and unsuitable for high frequency execution. This way of executing is also not viable for programmatic execution (for ex. via an api) as it requires the multisig signatures to be collected first before relaying is possible, which is asynchronous and slow in the real world.

The Execution API aims at solving this problem by creating another set of users called `executors`, who have the ability to override the multisig by performing safe module executions on the delegated sub-safes, given they abide by the set up policy.

### Goals

What will this feature achieve?
→ Allows delegatees to perform high frequency execution, which improves execution speed & UX for critical ops
→ Allows programmatic execution using the delegated funds, which enables users to efficiently run their own automations etc.

### Dependencies

- solidity - registry and module plugin for execution
- backend - endpoints for handling executors & execution requests
- frontend - UI for managing executors & raising execution requests

### Flow

- This is the expected workflow to execute transactions as an executor -
  (diagram assumes that the guard/fallback handler etc. & other setup required for delegated subAccount are already in place)

![Flow](./images/flow.png)

### Contracts

- Interactions with the contracts, mainly `ExecutorRegistry`, is required for managing executors.
- Direct user interactions -
  - `registerExecutor()` on `ExecutorRegistry`
  - `deRegisterExecutor()` on `ExecutorRegistry`

### Backend

- Main role is to receive execution request from the `executors` and validate it against the policy commit set up for the sub-account and call `executeTransaction()` on `ExecutorPlugin` with validator signature attached to the request if its valid.
- Direct user interactions -

  - GET `/accounts/user/executable/:userAddress/:chainId`

    - Called by user to get a list of all accounts where the user is an executor on.
    - response-

    ```json

    {
    "data": ["address",...]
    }
    ```

  - GET `/accounts/console/executors/:consoleAddress/:chainId`
    - Called by user to get a list of all the executors enabled on an account.
    - response-
    ```json
    {
    "data": ["address",...]
    }
    ```
  - POST `**/accounts/relayer/execute**`
    - request -
    ```json
    [{
    "executable": {
            "callType": "uint8",
            "target": "address",
            "value": "uint256",
            "data": "bytes"
        },
    "account": "address",
    "executor": "address",
    "executorSignature": "bytes"
    },...]
    ```
    - be validates user request, to check policy conditions
    - if valid, relays the transaction to `executeTransaction()` on `ExecutorPlugin` with validator signature attached to the execution request.
    - NOTE: multiple execution requests can be passed in the request array, and all transactions will be sent out in a single multicall, thus can be tracked under a single `trackingId`
    - response-
    ```json
    {
      "data": {
        "trackingId": "string",
        "error": "string"
      }
    }
    ```
  - POST `**/accounts/execute**`
    - request-
    ```json
    [{
    "executable": {
            "callType": "uint8",
            "target": "address",
            "value": "uint256",
            "data": "bytes"
        },
    "account": "address",
    "executor": "address",
    "executorSignature": "bytes"
    },...]
    ```
    - be validates user request, to check policy conditions
    - if valid, returns validator signature for user to relay it themselves
    - NOTE: multiple execution requests can be passed in the request array
    - response-
    ```json
    {
    "data": [{
    	"validatorSignature": "bytes",
    	"expiry": "uint256",
    	"error": "string"
    	}...]
    }
    ```
  - GET **`/relayer/tasks/status/:taskId`**
    - Called by user to check status of their transaction, if relayed by kulfi
    - response-
    ```json
    {
      "data": {
        "taskId": "bytes32",
        "metadata": {
          "request": {
            "taskId": "bytes32",
            "to": "address",
            "callData": "address",
            "requestedAt": "uint256",
            "timeout": "uint256",
            "signer": "address",
            "chainID": "uint256",
            "useSafeGasEstimate": "boolean",
            "enableAccessList": "boolean",
            "backendId": "uint256"
          },
          "response": {
            "isSuccessful": "boolean",
            "error": "",
            "transactionHash": "bytes32"
          }
        },
        "outputTransactionHash": "bytes32",
        "status": "string",
        "createdAt": "string"
      }
    }
    ```
