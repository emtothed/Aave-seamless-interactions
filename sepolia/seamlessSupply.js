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
const linkAddress = "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5";
const WETHAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const wrappedTokenGatewayV3Address =
  "0x387d311e47e80b498169e6fb51d3193167d89F7D";

// Conract objects
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

// Swap ETH for token using uniswapV3
async function swapETHForToken(swapAmount, token) {
  const network = await provider.getNetwork();
  console.log(`Swaping on : ${network.name} chain`);

  const params = {
    tokenIn: WETHAddress,
    tokenOut: token.address,
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

  const logs = receipt.events.filter((e) => e.address === token.address);
  const amountOut = parseInt(logs[0].data, 16) / 10 ** token.decimals;
  console.log(
    ` --- Swaped ${swapAmount} ETH for ${amountOut} ${token.symbol} ----`
  );
  return amountOut;
}

//swapETHForToken(0.0001, usdcAddress);

// swap ETH for token and supply the token in Seamless
async function supply(ethAmount, tokenAddress) {
  const poolProxyAddress = await poolAddressProviderContract.getPool();
  const poolContract = new ethers.Contract(poolProxyAddress, poolAbi, wallet);

  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const token = {
    address: tokenAddress,
    decimals: await tokenContract.decimals(),
    symbol: await tokenContract.symbol(),
  };

  const amountOut = await swapETHForToken(ethAmount, token);
  const supplyAmount = ethers.utils.parseUnits(
    amountOut.toString(),
    token.decimals
  );

  // Approving Seamless pool
  console.log("=============================================================");
  const approveTx = await tokenContract.approve(poolProxyAddress, supplyAmount);

  console.log(`Approve transaction hash: ${approveTx.hash}`);
  approveReceipt = await approveTx.wait();
  console.log(
    `Approve transaction confirmed in block ${approveReceipt.blockNumber}`
  );

  // Supplying token
  console.log("=============================================================");
  const supplyTx = await poolContract.supply(
    tokenAddress,
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

// Swap 0.001 ETH to token and supply all of the token in Aave
//supply(0.001, linkAddress).catch(console.error);

// Supply 0.00001 ETH in Seamless
//supplyEth(0.00001).catch(console.error);
