const fs = require('fs');
const xml2js = require('xml2js');

class UIHierarchyParser {
    constructor() {
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    parseString(xmlContent, outputPath) {
        try {
            // Parse XML to JSON
            this.parser.parseString(xmlContent, (err, result) => {
                if (err) {
                    console.error('Error parsing XML:', err);
                    return;
                }
                const nodes = findNodeByResourceId(result.hierarchy, 'cn.futu.trader:id/quote_portfolio_position_history_rv');
                const date = nodes.node[0].node.$.text
                const lastDate = fs.readFileSync('./lastcommit', { encoding: 'utf8' })
                if (date === lastDate) {
                    return
                }
                fs.writeFileSync('./lastcommit', date, { encoding: 'utf8' })
                const startIndex = 1
                let endIndex = 0
                for (let i = startIndex; i < nodes.node.length; i++) {
                    if (nodes.node[i].node.$?.text?.startsWith('2025')) {
                        endIndex = i
                        break
                    }
                }
                const rangeStocks = nodes.node.slice(1, endIndex)
                const csvStr = rangeStocks.map(item => item.node.map(i => i.$.text).join(',')).join('\n')
                fs.writeFileSync('./data.csv', csvStr, { encoding: 'utf8' })
            });
        } catch (error) {
            console.error('Error in parseString:', error);
        }
    }
}

// 用于递归查找包含特定 resourceId 的节点
function findNodeByResourceId(obj, resourceId) {
    let result = [obj];
    while (result.length > 0) {
        const obj = result.shift()
        // 如果是对象且包含 '$'（属性节点）
        if (obj['$'] && obj['$']['resource-id'] === resourceId) {
            console.log('obj', obj)
            return obj
        }

        // 如果当前对象有子对象数组，则递归查找
        if (Array.isArray(obj.node)) {
            obj.node.forEach(item => {
                result.push(item);
            });
        } else {
            obj.node && result.push(obj.node);
        }

    }

    return result;
}


module.exports = UIHierarchyParser;
