const { AdbHelper, executeAdbCommand } = require('./adb-examples');
const UIHierarchyParser = require('./xmlparser');
const DEVICE_ID = 'emulator-5554'
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  try {
    console.log('开始执行 adb 命令示例...\n');

    // 1. 检查 adb 是否可用
    console.log('1. 检查 adb 版本:');
    const version = await executeAdbCommand('version', DEVICE_ID);
    console.log(version);
    console.log('');

    // 2. 获取连接的设备
    console.log('2. 获取连接的设备:');
    const devices = await AdbHelper.getDevices();
    console.log('设备列表:', devices);
    console.log('');

    if (devices.length === 0) {
      console.log('没有检测到连接的设备，请确保:');
      console.log('- Android 设备已连接到电脑');
      console.log('- 已开启 USB 调试模式');
      console.log('- 已安装 adb 工具');
      return;
    }

    // 3. 获取设备信息
    console.log('3. 获取设备信息:');
    const androidVersion = await AdbHelper.getProperty('ro.build.version.release', DEVICE_ID);
    const deviceModel = await AdbHelper.getProperty('ro.product.model', DEVICE_ID);
    const deviceBrand = await AdbHelper.getProperty('ro.product.brand', DEVICE_ID);

    console.log(`设备品牌: ${deviceBrand}`);
    console.log(`设备型号: ${deviceModel}`);
    console.log(`Android 版本: ${androidVersion}`);
    console.log('');

    // 4. 执行一些基本操作
    console.log('4. 执行基本操作:');

    // // 获取当前活动的应用
    // const currentApp = await AdbHelper.shellCommand('adb logcat | grep "window"');
    // console.log('当前活动应用:', currentApp);

    // 获取屏幕分辨率
    const screenSize = await AdbHelper.shellCommand('wm size', DEVICE_ID);
    console.log('屏幕分辨率:', screenSize);

    // 获取电池信息
    const battery = await AdbHelper.shellCommand('dumpsys battery | grep level', DEVICE_ID);
    console.log('电池电量:', battery);

    console.log('\n示例执行完成！');

  } catch (error) {
    console.error('执行出错:', error.message);

    if (error.message.includes('command not found') || error.message.includes('not recognized')) {
      console.log('\n可能的原因:');
      console.log('- adb 工具未安装或未添加到环境变量');
      console.log('- 请安装 Android SDK 或独立的 adb 工具');
    }
  }
}

function scrollUp() {
  AdbHelper.swipe(500, 1000, 500, 20000, 200, DEVICE_ID);
  getNewXMLStructureWithRetry();
  setTimeout(() => {
    scrollUp()
  }, 10000)
}

async function getNewXMLStructureWithRetry() {
  try {
    await sleep(5000);
    let success = false;
    let lastError;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const newXMLStructure = await AdbHelper.shellCommand('uiautomator dump /sdcard/window_dump.xml', DEVICE_ID);
        await AdbHelper.pullFile('/sdcard/window_dump.xml', './window_dump.xml', DEVICE_ID);
        success = true;
      } catch (e) {
        lastError = e;
        const msg = String((e && e.message) || '');
        if (msg.includes('could not get idle state')) {
          try {
            await AdbHelper.home(DEVICE_ID);
            await sleep(700);
            await AdbHelper.startApp('cn.futu.trader', '.launch.activity.LaunchActivity', DEVICE_ID);
            await sleep(1500);
          } catch (_) { }
        }
        if (attempt < 2) {
          await sleep(800);
        }
      }
    }
    if (!success) {
      throw lastError || new Error('uiautomator dump failed after retries');
    }
    const fs = require('fs');
    const xmlContent = fs.readFileSync('./window_dump.xml', 'utf8');
    // 当 xmlContent 中不存在 "调仓历史"，则执行 BACK 并跳过本次定时器 tick
    if (!xmlContent || !xmlContent.includes('调仓历史')) {
      console.warn('Expected UI nodes not found; performing BACK and skipping this tick.');
      AdbHelper.back().catch(() => { });
      return;
    }
    // 当xmlContent中不存在"调仓历史"，则返回
    const parser = new UIHierarchyParser();
    parser.parseString(xmlContent, 'ui_hierarchy.csv');
  } catch (error) {
    console.error('获取XML结构失败:', error.message);
  }
}

// 运行示例
if (require.main === module) {
  main();
  AdbHelper.startApp('cn.futu.trader', '.launch.activity.LaunchActivity', DEVICE_ID);
  scrollUp()
} 