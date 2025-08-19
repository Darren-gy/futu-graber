const {
  Config,
  TradeContext,
  Decimal,
  OrderSide,
  TimeInForceType,
  OrderType,
  OrderStatus,
  QuoteContext,
  Language,
} = require("longport");
const fs = require('fs');
const cron = require('node-cron');

let currentSignalStr = ''
// 主函数
async function main() {

  const config = JSON.parse(fs.readFileSync('./keysss.txt', 'utf8'));
  const conf = new Config({ ...config, enablePrintQuotePackages: true });
  const quoteCtx = await new QuoteContext.new(conf)

  // 读取交易信号文件
  function readTradeSignals() {
    try {
      const orderCsv = fs.readFileSync('./data.csv', 'utf8');
      return orderCsv.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(',');
          return {
            name: parts[0],
            allocation: parseAllocation(parts[1]),
            symbol: `${parts[2]}.US`,
            price: parsePrice(parts[3])
          };
        });
    } catch (error) {
      console.error('读取交易信号文件失败:', error);
      return [];
    }
  }

  // 解析持仓比例变化 (如 "31.07%->0.00%")
  function parseAllocation(allocationStr) {
    if (!allocationStr) return { current: 0, target: 0 };
    const match = allocationStr.match(/(\d+\.\d+)%->(\d+\.\d+)%/);
    if (match) {
      return {
        current: parseFloat(match[1]) / 100,
        target: parseFloat(match[2]) / 100
      };
    }
    return { current: 0, target: 0 };
  }

  // 解析参考价格
  function parsePrice(priceStr) {
    if (!priceStr) return null;
    const match = priceStr.match(/参考成交价\s+(\d+\.\d+)/);
    return match ? parseFloat(match[1]) : null;
  }

  // 获取当前持仓信息
  async function getCurrentPositions(ctx) {
    try {
      const response = await ctx.stockPositions();
      const positions = [];

      // 遍历所有账户通道
      for (const channel of response.channels) {
        for (const pos of channel.positions) {
          positions.push({
            symbol: pos.symbol,
            quantity: pos.quantity.toNumber(),
            // 注意：stockPositions API 不直接提供市值，这里需要另外计算
            // 这里假设有市值数据，实际使用时可能需要通过行情API获取价格后计算
            marketValue: 0 // 需要通过当前价格计算
          });
        }
      }
      return positions;
    } catch (error) {
      console.error('获取持仓信息失败:', error);
      return [];
    }
  }

  // 获取账户资产信息，包括融资额度
  async function getAccountBalance(ctx) {
    try {
      const balance = await ctx.accountBalance();

      // // 获取融资额度信息
      // let marginAmount = 0;
      // try {
      //   // 这里使用一个示例股票获取融资比例，实际应用中可能需要针对不同股票单独计算
      //   // const marginRatio = await ctx.marginRatio('AAPL.US');
      //   // 计算可用的融资额度 = 剩余融资额度
      //   marginAmount = balance.remainingFinanceAmount.toNumber();
      // } catch (error) {
      //   console.error('获取融资比例失败:', error);
      // }

      return {
        totalAssets: balance[0].netAssets.toNumber(),
        cashBalance: balance[0].netAssets.toNumber() / 8,
        marginAmount: 0,
        // 总可用资产 = 净资产 + 可用融资额度
        totalAvailableAssets: balance[0].netAssets.toNumber() / 8
      };
    } catch (error) {
      console.error('获取账户资产信息失败:', error);
      return { totalAssets: 0, cashBalance: 0, marginAmount: 0, totalAvailableAssets: 0 };
    }
  }

  // 读取上次提交的时间戳
  function readLastCommitTimestamp() {
    try {
      if (fs.existsSync('./lastcommit')) {
        return fs.readFileSync('./lastcommit', 'utf8').trim();
      }
      return null;
    } catch (error) {
      console.error('读取上次提交时间戳失败:', error);
      return null;
    }
  }


  // 计算需要调整的交易
  function calculateTradeAdjustments(signals, positions, accountBalance) {
    const trades = [];

    // 计算每个信号需要的目标市值，使用包含融资额度的总资产
    signals.forEach(signal => {
      if (!signal.symbol) return;

      const targetValue = accountBalance.totalAvailableAssets * signal.allocation.target;
      const currentPosition = positions.find(p => p.symbol === signal.symbol);
      const currentValue = currentPosition ? currentPosition.marketValue : 0;

      // 如果目标持仓为0且当前有持仓，直接全部卖出
      if (signal.allocation.target === 0 && currentPosition && currentPosition.quantity > 0) {
        trades.push({
          symbol: signal.symbol,
          side: OrderSide.Sell,
          price: signal.price,
          quantity: currentPosition.quantity
        });
        return;
      }

      if (Math.abs(targetValue - currentValue) > 1) { // 1元以上的差异才调整
        if (targetValue > currentValue) {
          // 买入操作 - 检查当前比例是否已经满足目标比例
          const currentRatio = currentValue / accountBalance.totalAvailableAssets;
          if (currentRatio < signal.allocation.target) {
            // 计算需要增加的比例
            const additionalRatioNeeded = signal.allocation.target - currentRatio;
            // 计算需要增加的市值
            const additionalValueNeeded = accountBalance.totalAvailableAssets * additionalRatioNeeded;
            // 计算需要买入的数量
            const quantity = Math.floor(additionalValueNeeded / signal.price);

            if (quantity > 0) {
              trades.push({
                symbol: signal.symbol,
                side: OrderSide.Buy,
                price: signal.price,
                quantity
              });
            }
          } else {
            console.log(`跳过 ${signal.symbol} 的买入操作：当前比例 ${(currentRatio * 100).toFixed(2)}% 已满足目标比例 ${(signal.allocation.target * 100).toFixed(2)}%`);
          }
        } else {
          // 卖出操作 - 检查是否有持仓
          if (currentPosition && currentPosition.quantity > 0) {
            const diffValue = Math.abs(targetValue - currentValue);
            const quantity = Math.min(
              Math.floor(diffValue / signal.price),
              currentPosition.quantity // 确保不超过当前持仓数量
            );

            if (quantity > 0) {
              trades.push({
                symbol: signal.symbol,
                side: OrderSide.Sell,
                price: signal.price,
                quantity
              });
            }
          } else {
            console.log(`跳过 ${signal.symbol} 的卖出操作：没有持仓，不允许卖空`);
          }
        }
      }
    });

    return trades;
  }

  // 获取股票的市场价格
  async function getMarketPrice(ctx, symbol) {
    try {
      const quote = await quoteCtx.quote([symbol]);
      for (let obj of quote) {
        console.log(obj.toString())
      }
      const [price] = [...quote]
      return price.lastDone.toNumber();
    } catch (error) {
      console.error(`获取${symbol}市场价格失败:`, error);
      return null;
    }
  }

  // 检查价格偏离度
  function isPriceDeviationAcceptable(orderPrice, marketPrice) {
    if (!marketPrice) return false;

    const deviation = Math.abs(orderPrice - marketPrice) / marketPrice;
    return deviation <= 0.003; // 0.1%以内的偏离是可接受的
  }

  // 执行交易
  async function executeTrades(ctx, trades) {
    for (const trade of trades) {
      try {
        // 获取市场价格
        const marketPrice = await getMarketPrice(ctx, trade.symbol);

        // 检查价格偏离度
        if (!isPriceDeviationAcceptable(trade.price, marketPrice)) {
          console.log(`价格偏离过大，取消交易: ${trade.symbol} 订单价格: ${trade.price}, 市场价格: ${marketPrice}`);
          continue;
        }

        console.log(`执行交易: ${trade.side === OrderSide.Buy ? '买入' : '卖出'} ${trade.symbol} ${trade.quantity}股 价格${trade.price} (市场价格: ${marketPrice})`);

        const resp = await ctx.submitOrder({
          symbol: trade.symbol,
          orderType: OrderType.LO,
          side: trade.side,
          timeInForce: TimeInForceType.Day,
          submittedPrice: new Decimal(Math.round(trade.price * 100) / 100),
          submittedQuantity: new Decimal(trade.quantity.toString()),
        });

        console.log('订单提交成功:', resp.orderId);
      } catch (error) {
        console.error(`订单提交失败 ${trade.symbol}:`, error);
      }
    }
  }

  // 取消所有未成交订单
  async function cancelAllPendingOrders(ctx) {
    try {
      const pendingOrders = await ctx.todayOrders({
        status: [OrderStatus.New],
      });

      for (const order of pendingOrders) {
        try {
          await ctx.cancelOrder(order.orderId);
          console.log(`已取消订单: ${order.orderId}`);
        } catch (error) {
          console.error(`取消订单失败 ${order.orderId}:`, error);
        }
      }
    } catch (error) {
      console.error('获取未成交订单失败:', error);
    }
  }
  try {


    // 读取上次提交的时间戳
    const lastCommitTimestamp = readLastCommitTimestamp();
    // 如果上次提交的时间戳存在，且交易信号没有变化，则不执行交易
    if (lastCommitTimestamp && currentSignalStr === lastCommitTimestamp) {
      console.log('交易信号未变化，不执行交易');
      return;
    }
    // 保存当前交易信号作为时间戳
    currentSignalStr = lastCommitTimestamp


    // 创建交易上下文
    const ctx = await TradeContext.new(conf);

    // 读取交易信号
    const signals = readTradeSignals();



    console.log('当前交易信号:', signals);

    // 获取当前持仓和账户资产
    const positions = await getCurrentPositions(ctx);
    const accountBalance = await getAccountBalance(ctx);

    console.log('当前持仓:', positions);
    console.log('账户资产:', accountBalance);



    // 计算需要调整的交易
    const trades = calculateTradeAdjustments(signals, positions, accountBalance);
    console.log('需要执行的交易:', trades);

    // 取消所有未成交订单
    await cancelAllPendingOrders(ctx);

    // 执行新的交易
    await executeTrades(ctx, trades);



  } catch (error) {
    console.error('程序执行错误:', error);
  }

}

console.log(`程序启动，使用cron任务每5秒检查一次交易信号`);

// 使用cron任务，每5秒执行一次
let isRunning = false;
cron.schedule('*/30 * * * * *', async () => {
  if (isRunning) {
    console.log(`上一个任务还在执行中，跳过本次执行: ${new Date().toLocaleString()}`);
    return;
  }

  isRunning = true;
  console.log(`定时任务执行: ${new Date().toLocaleString()}`);

  try {
    await main();
  } catch (error) {
    console.error('任务执行出错:', error);
  } finally {
    isRunning = false;
  }
});
