const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '../config/ai-model.json');

/**
 * GET /api/ai-config
 * 获取 AI 模型配置
 */
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return res.json({
        success: true,
        data: { provider: '', baseUrl: '', apiKey: '', model: '', enabled: false },
      });
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // 不返回完整 apiKey，只返回掩码
    const safeConfig = { ...config };
    if (safeConfig.apiKey && safeConfig.apiKey.length > 8) {
      safeConfig.apiKeyMasked = safeConfig.apiKey.substring(0, 4) + '****' + safeConfig.apiKey.substring(safeConfig.apiKey.length - 4);
      delete safeConfig.apiKey;
    } else if (safeConfig.apiKey) {
      safeConfig.apiKeyMasked = '****';
      delete safeConfig.apiKey;
    }
    res.json({ success: true, data: safeConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-config
 * 保存 AI 模型配置
 */
router.post('/', (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model, enabled } = req.body;
    const config = {
      provider: provider || '',
      baseUrl: baseUrl || '',
      apiKey: apiKey || '',
      model: model || '',
      enabled: !!enabled,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    res.json({ success: true, data: { ...config, apiKey: '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-config/test
 * 测试 AI 模型连接
 */
router.post('/test', async (req, res) => {
  try {
    const { baseUrl, apiKey, model } = req.body;
    if (!baseUrl || !apiKey || !model) {
      return res.status(400).json({ success: false, error: '请填写完整配置' });
    }

    const https = require('https');
    const url = new URL(baseUrl + '/chat/completions');
    const payload = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
      max_tokens: 10,
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.message?.content;
              res.json({ success: true, data: { message: '连接成功，模型返回: ' + (content || '(空)') } });
            } catch {
              res.json({ success: true, data: { message: '连接成功（HTTP ' + resp.statusCode + '）' } });
            }
          } else {
            res.json({ success: false, error: `HTTP ${resp.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (err) => {
        res.json({ success: false, error: '连接失败: ' + err.message });
      });
      req.setTimeout(15000, () => { req.destroy(); res.json({ success: false, error: '连接超时 (15s)' }); });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
