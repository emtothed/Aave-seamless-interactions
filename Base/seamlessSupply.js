const { ethers, Contract } = require("ethers");
require("dotenv").config();
const provider = new ethers.providers.JsonRpcProvider(process.env.BASE_RPC_URL);
const wallet = new ethers.Wallet(process.env.BASE_PRIVATE_KEY, provider);
const SwapRouterABI = require("./abi/baseRouterABI.json"); // Router ABI for base
const wrappedTokenGatewayV3ABI = require("./abi/wrappedTokenGatewayV3ABI.json"); //base
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
const swapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";
const poolAddressProviderAddress = "0x0E02EB705be325407707662C6f6d3466E939f3a0";
const wrappedTokenGatewayV3Address =
  "0xaeeB3898edE6a6e86864688383E211132BAa1Af3";

// Token addresses based on seamless protocol UI
const WETHAddress = "0x4200000000000000000000000000000000000006";
const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const cbETHAddress = "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22";
const wstETH = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452"; //**** CHECK UNISWAP POOL LIQUIDITY BEFORE SWAPPING THIS TOKEN ****
const daiAddress = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";

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
    gasPrice: (await provider.getGasPrice()).mul(105).div(100),
  });
  console.log(`Swap transaction hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Swap transaction confirmed in block ${receipt.blockNumber}`);

  const logs = receipt.events.filter((e) => e.address === token.address);
  const amountOut = BigInt(parseInt(logs[0].data, 16));
  console.log(
    ` --- Swaped ${swapAmount} ETH for ${
      Number(amountOut) / 10 ** token.decimals
    } ${token.symbol} ----`
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

  // swapp eth with token
  const supplyAmount = await swapETHForToken(ethAmount, token);

  // Approving Seamless pool
  console.log("=============================================================");
  const approveTx = await tokenContract.approve(
    poolProxyAddress,
    supplyAmount,
    {
      gasPrice: (await provider.getGasPrice()).mul(105).div(100),
    }
  );

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
    0,
    {
      gasPrice: (await provider.getGasPrice()).mul(105).div(100),
    }
  );
  console.log(`Supply transaction hash: ${supplyTx.hash}`);
  supplyReceipt = await supplyTx.wait();
  console.log(
    `Supply transaction confirmed in block ${supplyReceipt.blockNumber}`
  );
}

// supply ETH in Seamless
async function supplyEth(amount) {
  const ethAmount = ethers.utils.parseEther(amount.toString());
  const poolProxyAddress = await poolAddressProviderContract.getPool();

  const tx = await wtGatewayContract.depositETH(
    poolProxyAddress,
    wallet.address,
    0,
    {
      value: ethAmount,
      gasPrice: (await provider.getGasPrice()).mul(105).div(100),
    }
  );
  console.log(`ETH supply transaction hash: ${tx.hash}`);
  receipt = await tx.wait();
  console.log(
    `ETH supply transaction confirmed in block ${receipt.blockNumber}`
  );
}

// Swap 0.00001 ETH to DAI and supply all of the DAI in Seamless
//supply(0.000001, wstETH).catch(console.error);

// Supply 0.00001 ETH in Seamless
//supplyEth(0.000001).catch(console.error);
