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
    cb(null, 'uploads/'); // 上传文件存储目录
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // 防止文件名冲突
  },
});

const upload = multer({ storage: storage });

// 提供静态文件服务
app.use(express.static('public'));

// 文件上传和压缩处理路由
app.post('/compress', upload.single('glbFile'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const outputPath = 'compressed/' + req.file.filename;
    const compressionLevel = parseInt(req.body.compressionLevel) || 5;

    // 确保输出目录存在
    if (!fs.existsSync('compressed')) {
      fs.mkdirSync('compressed');
    }

    // 创建 Draco 编码器模块
    const dracoEncoderModule = await draco3d.createEncoderModule();

    // 使用 glTF Transform 进行压缩
    const io = new NodeIO()
      .registerExtensions(KHRONOS_EXTENSIONS)
      .registerDependencies({
        'draco3d.encoder': dracoEncoderModule,
      });

    const document = await io.read(inputPath);

    // 根据压缩等级调整参数
    const quantizationLevel = Math.max(8, 14 - compressionLevel);

    await document.transform(
      // Draco 压缩
      draco({
        method: 'edgebreaker',
        quantizePosition: quantizationLevel,
        quantizeNormal: Math.max(8, quantizationLevel - 2),
        quantizeTexcoord: Math.max(8, quantizationLevel - 2),
        quantizeColor: 8,
        quantizeGeneric: 8,
      }),
      // 纹理压缩
      textureCompress({
        encoder: require('sharp'),
        targetFormat: 'webp',
        quality: Math.max(60, 100 - compressionLevel * 4),
        maxTextureSize: 2048 >> (compressionLevel >> 1) // 根据压缩等级调整最大纹理大小
      }),
      // 删除重复数据
      dedup(),
      // 删除未使用的资源
      prune()
    );

    await io.write(outputPath, document);

    // 将压缩后的文件发送给客户端
    res.download(outputPath, req.file.originalname.replace('.glb', '_compressed.glb'), (err) => {
      if (err) {
        console.error(err);
      }
      // 删除临时文件
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error('压缩过程出现错误：', error);
    res.status(500).send('文件压缩失败');
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器已启动：http://localhost:${port}`);
});