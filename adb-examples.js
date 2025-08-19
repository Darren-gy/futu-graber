const { exec, execSync, spawn } = require('child_process');
const { promisify } = require('util');

// 方法1: 使用 exec (异步，返回 Promise)
const execAsync = promisify(exec);

// 修改后的通用执行函数
async function executeAdbCommand(command, deviceId) {
    const prefix = deviceId ? `-s ${deviceId} ` : '';
    try {
        const { stdout, stderr } = await execAsync(`adb ${prefix}${command}`);
        if (stderr) console.log('stderr:', stderr);
        return stdout.trim();
    } catch (error) {
        console.error('执行 adb 命令出错:', error.message);
        throw error;
    }
}

function executeAdbCommandSync(command, deviceId) {
    const prefix = deviceId ? `-s ${deviceId} ` : '';
    try {
        const result = execSync(`adb ${prefix}${command}`, { encoding: 'utf8' });
        return result.trim();
    } catch (error) {
        console.error('执行 adb 命令出错:', error.message);
        throw error;
    }
}

function executeAdbCommandSpawn(command, deviceId) {
    return new Promise((resolve, reject) => {
        const args = (deviceId ? ['-s', deviceId] : []).concat(command.split(' '));
        const adbProcess = spawn('adb', args);

        let stdout = '';
        let stderr = '';

        adbProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        adbProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        adbProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(`adb 命令执行失败，退出代码: ${code}\n${stderr}`));
            }
        });

        adbProcess.on('error', (error) => {
            reject(new Error(`启动 adb 进程失败: ${error.message}`));
        });
    });
}
class AdbHelper {
    static async getDevices() {
        const output = await executeAdbCommand('devices');
        const lines = output.split('\n').slice(1);
        return lines
            .filter(line => line.trim() && !line.includes('offline'))
            .map(line => {
                const [device, status] = line.trim().split('\t');
                return { device, status };
            });
    }

    static async installApk(apkPath, deviceId) {
        return await executeAdbCommand(`install "${apkPath}"`, deviceId);
    }

    static async uninstallApp(packageName, deviceId) {
        return await executeAdbCommand(`uninstall ${packageName}`, deviceId);
    }

    static async startApp(packageName, activityName, deviceId) {
        return await executeAdbCommand(`shell am start -n ${packageName}/${activityName}`, deviceId);
    }

    static async stopApp(packageName, deviceId) {
        return await executeAdbCommand(`shell am force-stop ${packageName}`, deviceId);
    }

    static async pushFile(localPath, remotePath, deviceId) {
        return await executeAdbCommand(`push "${localPath}" "${remotePath}"`, deviceId);
    }

    static async pullFile(remotePath, localPath, deviceId) {
        return await executeAdbCommand(`pull "${remotePath}" "${localPath}"`, deviceId);
    }

    static async shellCommand(command, deviceId) {
        return await executeAdbCommand(`shell "${command}"`, deviceId);
    }

    static async getProperty(property, deviceId) {
        return await executeAdbCommand(`shell getprop ${property}`, deviceId);
    }

    static async takeScreenshot(localPath, deviceId) {
        const remotePath = '/sdcard/screenshot.png';
        await executeAdbCommand(`shell screencap -p ${remotePath}`, deviceId);
        return await executeAdbCommand(`pull ${remotePath} "${localPath}"`, deviceId);
    }

    static async inputText(text, deviceId) {
        return await executeAdbCommand(`shell input text "${text}"`, deviceId);
    }

    static async tap(x, y, deviceId) {
        return await executeAdbCommand(`shell input tap ${x} ${y}`, deviceId);
    }

    static async swipe(x1, y1, x2, y2, duration = 300, deviceId) {
        return await executeAdbCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`, deviceId);
    }
}


// 错误处理和重试机制
async function executeAdbWithRetry(command, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await executeAdbCommand(command);
        } catch (error) {
            console.log(`第 ${i + 1} 次尝试失败:`, error.message);
            if (i === maxRetries - 1) {
                throw error;
            }
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

module.exports = {
    executeAdbCommand,
    executeAdbCommandSync,
    executeAdbCommandSpawn,
    executeAdbWithRetry,
    AdbHelper
};
