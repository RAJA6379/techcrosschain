// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract SwapPool {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public constant FEE_BPS = 30; // 0.30%
    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "Amounts required");
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
    }
    function getAmountOut(
        uint256 amountIn,
        bool aToB
    ) public view returns (uint256) {
        require(amountIn > 0, "Amount required");
        uint256 rIn = aToB ? reserveA : reserveB;
        uint256 rOut = aToB ? reserveB : reserveA;
        require(rIn > 0 && rOut > 0, "No liquidity");
        uint256 feeAdjusted = amountIn * (10000 - FEE_BPS);
        return (feeAdjusted * rOut) / (rIn * 10000 + feeAdjusted);
    }
    function swap(uint256 amountIn, bool aToB, uint256 minAmountOut) external {
        uint256 out = getAmountOut(amountIn, aToB);
        require(out >= minAmountOut, "Slippage");
        if (aToB) {
            tokenA.transferFrom(msg.sender, address(this), amountIn);
            tokenB.transfer(msg.sender, out);
            reserveA += amountIn;
            reserveB -= out;
        } else {
            tokenB.transferFrom(msg.sender, address(this), amountIn);
            tokenA.transfer(msg.sender, out);
            reserveB += amountIn;
            reserveA -= out;
        }
    }
}
