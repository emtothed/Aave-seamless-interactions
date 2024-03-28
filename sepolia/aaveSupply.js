const { ethers, Contract } = require("ethers");
require("dotenv").config();
const provider = new ethers.providers.JsonRpcProvider(
  process.env.SEPOLIA_RPC_URL
);
const wallet = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY, provider);
const SwapRouterABI = require("./abi/sepoliaRouterABI.json"); // Router ABI for sepolia
const wrappedTokenGatewayV3ABI = require("./abi/sepoliaWrappedTokenGatewayV3ABI.json"); //sepolia
const {
  abi: poolAddressProviderABI,
} = require("@aave/core-v3/artifacts/contracts/protocol/configuration/PoolAddressesProvider.sol/PoolAddressesProvider.json");
const {
  abi: poolAbi,
} = require("@aave/core-v3/artifacts/contracts/interfaces/IPool.sol/IPool.json");
const {
  abi: erc20Abi,
} = require("@aave/core-v3/artifacts/contracts/dependencies/openzeppelin/contracts/ERC20.sol/ERC20.json");

// Deployment addresses
const swapRouterAddress = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const poolAddressProviderAddress = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";
const usdcAddress = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const WETHAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const wrappedTokenGatewayV3Address =
  "0x387d311e47e80b498169e6fb51d3193167d89F7D";

// Conract objects
const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, wallet);
const poolAddressProviderContract = new ethers.Contract(
  poolAddressProviderAddress,
  poolAddressProviderABI,
  wallet
);
const wtGatewayContract = new ethers.Contract(
  wrappedTokenGatewayV3Address,
  wrappedTokenGatewayV3ABI,
  wallet
);
const swapRouter = new ethers.Contract(
  swapRouterAddress,
  SwapRouterABI,
  wallet
);

// Swap ETH for USDC using uniswapV3
async function swapETHForToken(swapAmount, tokenAddress) {
  const network = await provider.getNetwork();
  console.log(`Swaping on : ${network.name} chain`);

  const params = {
    tokenIn: WETHAddress,
    tokenOut: tokenAddress,
    fee: 3000,
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000 + 60 * 10), // 10 minutes
    amountIn: ethers.utils.parseEther(swapAmount.toString()),
    amountOutMinimum: 0, // No min
    sqrtPriceLimitX96: 0, // No limit
  };

  console.log("=============================================================");
  const tx = await swapRouter.exactInputSingle(params, {
    value: ethers.utils.parseEther(swapAmount.toString()),
  });
  console.log(`Swap transaction hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Swap transaction confirmed in block ${receipt.blockNumber}`);

  const logs = receipt.events.filter((e) => e.address === usdcAddress);
  const amountOut = parseInt(logs[0].data, 16) / 10 ** 6;
  console.log(` --- Swaped ${swapAmount} ETH for ${amountOut} USDC ----`);
  return amountOut;
}

// swap ETH for USDC and supply the USDC in Aave
async function supply(ethamount) {
  const amountOut = await swapETHForToken(ethamount, usdcAddress);

  const poolProxyAddress = await poolAddressProviderContract.getPool();
  const poolContract = new ethers.Contract(poolProxyAddress, poolAbi, wallet);
  const decimals = await usdcContract.decimals();
  const supplyAmount = ethers.utils.parseUnits(amountOut.toString(), decimals);

  // Approving Aave pool
  console.log("=============================================================");
  const approveTx = await usdcContract.approve(poolProxyAddress, supplyAmount);
  console.log(`Approve transaction hash: ${approveTx.hash}`);
  approveReceipt = await approveTx.wait();
  console.log(
    `Approve transaction confirmed in block ${approveReceipt.blockNumber}`
  );

  // Supplying USDC
  console.log("=============================================================");
  const supplyTx = await poolContract.supply(
    usdcAddress,
    supplyAmount,
    wallet.address,
    0
  );
  console.log(`Supply transaction hash: ${supplyTx.hash}`);
  supplyReceipt = await supplyTx.wait();
  console.log(
    `Supply transaction confirmed in block ${supplyReceipt.blockNumber}`
  );
}

// supply ETH in Aave
async function supplyEth(amount) {
  const ethAmount = ethers.utils.parseEther(amount.toString());
  const poolProxyAddress = await poolAddressProviderContract.getPool();

  const tx = await wtGatewayContract.depositETH(
    poolProxyAddress,
    wallet.address,
    0,
    {
      value: ethAmount,
    }
  );
  console.log(`ETH supply transaction hash: ${tx.hash}`);
  receipt = await tx.wait();
  console.log(
    `ETH supply transaction confirmed in block ${receipt.blockNumber}`
  );
}

// Swap 0.1 ETH to USDC and supply all of the USDC in Aave
supply(0.01).catch(console.error);

// Supply 0.1 ETH in Aave
//supplyEth(0.01).catch(console.error);
