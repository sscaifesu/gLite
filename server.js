// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const draco3d = require('draco3dgltf');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
const { draco, textureCompress, dedup, prune } = require('@gltf-transform/functions');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// 使用 body-parser 中间件
app.use(bodyParser.urlencoded({ extended: true }));

// 设置 Multer 存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.glb')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传GLB文件'));
    }
  },
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB
  }
}).single('glbFile');

// 提供静态文件服务
app.use(express.static('public'));

// 在 app.use(express.static('public')); 之后添加
app.use('/compressed', express.static('compressed'));

// 文件上传和压缩处理路由
app.post('/compress', (req, res) => {
  upload(req, res, async function(err) {
    if (err) {
      // Multer 错误，例如文件大小超出限制
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send('文件大小超过200MB限制');
      }
      return res.status(400).send(err.message);
    }

    const inputPath = req.file.path;
    const originalFileName = req.file.originalname;
    const compressedFileName = originalFileName.replace('.glb', '-compressed.glb');
    const outputPath = path.join('compressed', compressedFileName);
    const compressionLevel = parseInt(req.body.compressionLevel) || 5;

    // 设置 SSE 头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    try {
      // 创建 Draco 编码器模块
      const dracoEncoderModule = await draco3d.createEncoderModule();

      console.log('Draco encoder module created:', dracoEncoderModule);

      const io = new NodeIO()
        .registerExtensions(KHRONOS_EXTENSIONS)
        .registerDependencies({
          'draco3d.encoder': dracoEncoderModule,
        });

      console.log('IO dependencies registered');

      const document = await io.read(inputPath);

      // 定义进度回调函数
      let totalSteps = 4; // Draco压缩、纹理压缩、删除重复数据、删除未使用资源
      let currentStep = 0;

      const updateProgress = (step, details = '') => {
        currentStep++;
        const progress = Math.round((currentStep / totalSteps) * 100);
        const message = `data: ${JSON.stringify({ progress, step, details })}\n\n`;
        console.log('Sending progress update:', message);
        res.write(message);
        
        // 使用 setImmediate 来确保数据被发送
        setImmediate(() => {
          res.flushHeaders();
        });
      };

      // 在压缩过程开始前发送初始进度
      console.log('Starting compression process');
      updateProgress('开始压缩', '准备中');

      console.log('Starting document transform');

      await document.transform(
        draco({
          method: 'edgebreaker',
          quantizePosition: Math.max(8, 14 - compressionLevel),
          quantizeNormal: Math.max(8, Math.max(8, 14 - compressionLevel) - 2),
          quantizeTexcoord: Math.max(8, Math.max(8, 14 - compressionLevel) - 2),
          quantizeColor: 8,
          quantizeGeneric: 8,
          onProgress: () => {
            console.log('Draco compression progress');
            updateProgress('Draco压');
          }
        }),
        textureCompress({
          encoder: require('sharp'),
          targetFormat: 'webp',
          quality: Math.max(60, 100 - compressionLevel * 4),
          maxTextureSize: 2048 >> (compressionLevel >> 1),
          onProgress: () => {
            console.log('Texture compression progress');
            updateProgress('纹理压缩');
          }
        }),
        dedup({
          onProgress: () => {
            console.log('Deduplication progress');
            updateProgress('删除重复数据');
          }
        }),
        prune({
          onProgress: () => {
            console.log('Pruning progress');
            updateProgress('删除未使用资源');
          }
        })
      );

      console.log('Writing file');
      updateProgress('写入文件', '');

      await io.write(outputPath, document);

      console.log('Compression complete');
      updateProgress('完成', compressedFileName); // 只发送文件名，而不是完整路径

      // 添加最终的 100% 进度更新
      updateProgress('完成', '压缩过程已完成');

      res.write('event: close\ndata: close\n\n');
      res.end();

      // Schedule file deletion after 30 minutes
      function scheduleFileDeletion(filePath) {
        setTimeout(() => {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`删除文件失败: ${filePath}`, err);
            } else {
              console.log(`文件已删除: ${filePath}`);
            }
          });
        }, 30 * 60 * 1000); // 30分钟
      }

      scheduleFileDeletion(inputPath);
    } catch (error) {
      console.error('压缩过程出现错误：', error);
      res.write(`data: ${JSON.stringify({ error: error.message || '文件压缩失败' })}\n\n`);
      res.end();
    }
  });
});

// 添加一个新的路由来处理文件下载
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'compressed', filename);
  console.log('Attempting to download file:', filePath);
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('下载文件时出错:', err);
      res.status(500).send('下载文件时出错');
    }
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器已启动：http://localhost:${port}`);
});