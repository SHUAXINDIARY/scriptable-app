// Scriptable 液态玻璃数字展示组件
// 可用作 iOS 主屏幕小组件
// 从截图中提取真实颜色生成符合色系的渐变背景

// ===== 文案常量 =====
const DEFAULT_TITLE = "计时第";

const TEXTS = {
  widget: {
    subtitle: "天",
  },
  colorPicker: {
    title: "选择图片",
    message: "选择一张图片来提取颜色生成背景",
    selectImage: "从相册选择",
    useDefault: "使用默认配色",
  },
  datePicker: {
    title: "选择日期",
    message: "选择一个起始日期来计算天数",
    confirm: "确定",
  },
  titlePicker: {
    title: "设置标题",
    message: "输入自定义标题，留空则使用默认标题",
    placeholder: "例如：计时第",
    confirm: "确定",
    useDefault: "使用默认",
  },
};

// ===== 标题相关 =====

// 获取保存的标题或让用户自定义
async function getWidgetTitle() {
  let fm = FileManager.local();
  let path = fm.joinPath(fm.documentsDirectory(), "widget-title.txt");

  // 如果是组件模式，直接读取保存的标题
  if (config.runsInWidget) {
    if (fm.fileExists(path)) {
      try {
        let title = fm.readString(path);
        // 确保标题不为空
        if (title && title.trim()) {
          return title.trim();
        }
      } catch (e) {
        // 如果读取失败，使用默认标题
      }
    }
    return DEFAULT_TITLE;
  }

  // 在 App 中运行时，让用户输入标题
  let alert = new Alert();
  alert.title = TEXTS.titlePicker.title;
  alert.message = TEXTS.titlePicker.message;
  alert.addTextField(
    TEXTS.titlePicker.placeholder,
    fm.fileExists(path) ? fm.readString(path) : ""
  );
  alert.addAction(TEXTS.titlePicker.confirm);
  alert.addCancelAction(TEXTS.titlePicker.useDefault);

  let choice = await alert.present();

  let title;
  if (choice === 0) {
    // 用户点击确定
    title = alert.textFieldValue(0).trim();
    if (title === "") {
      title = DEFAULT_TITLE;
    }
  } else {
    // 用户点击使用默认
    title = DEFAULT_TITLE;
  }

  // 保存标题（确保数据被正确保存）
  try {
    fm.writeString(path, title);
  } catch (e) {
    console.error("保存标题失败:", e);
  }

  return title;
}

// ===== 日期相关 =====

// 获取保存的日期或让用户选择
async function getStartDate() {
  let fm = FileManager.local();
  let path = fm.joinPath(fm.documentsDirectory(), "widget-start-date.txt");

  // 如果是组件模式，直接读取保存的日期
  if (config.runsInWidget) {
    if (fm.fileExists(path)) {
      try {
        let dateStr = fm.readString(path);
        let date = new Date(dateStr);
        // 验证日期是否有效
        if (isNaN(date.getTime())) {
          // 如果日期无效，返回今天
          return new Date();
        }
        return date;
      } catch (e) {
        // 如果读取失败，返回今天
        return new Date();
      }
    }
    // 默认返回今天
    return new Date();
  }

  // 在 App 中运行时，让用户选择日期
  let datePicker = new DatePicker();
  datePicker.initialDate = fm.fileExists(path)
    ? new Date(fm.readString(path))
    : new Date();
  datePicker.minimumDate = new Date(2000, 0, 1);
  datePicker.maximumDate = new Date();

  let alert = new Alert();
  alert.title = TEXTS.datePicker.title;
  alert.message = TEXTS.datePicker.message;
  alert.addAction(TEXTS.datePicker.confirm);
  await alert.present();

  let selectedDate = await datePicker.pickDate();

  // 保存选择的日期（使用 ISO 格式确保兼容性）
  try {
    fm.writeString(path, selectedDate.toISOString());
  } catch (e) {
    console.error("保存日期失败:", e);
  }

  return selectedDate;
}

// 计算两个日期之间的天数
function calculateDaysBetween(startDate, endDate) {
  // 将日期设置为当天的 00:00:00 来计算完整天数
  let start = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  let end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );

  let diffTime = end.getTime() - start.getTime();
  let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return Math.abs(diffDays);
}

// 格式化数字，添加千分位分隔符
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ===== 真实颜色提取（使用 WebView）=====

// 使用 WebView 提取图片的真实颜色
async function extractRealColors(img) {
  // 将图片转为 base64
  let imgData = Data.fromPNG(img);
  let base64 = imgData.toBase64String();

  // 创建 WebView 来分析图片颜色
  let webView = new WebView();

  // HTML + JavaScript 代码来提取颜色
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
        <canvas id="canvas"></canvas>
        <script>
            function extractColors() {
                return new Promise((resolve) => {
                    let img = new Image();
                    img.onload = function() {
                        let canvas = document.getElementById('canvas');
                        let ctx = canvas.getContext('2d');
                        
                        // 缩小图片以加快处理速度
                        let sampleSize = 100;
                        canvas.width = sampleSize;
                        canvas.height = sampleSize;
                        
                        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
                        
                        // 采样点
                        let points = [
                            {x: 0.1, y: 0.1},   // 左上
                            {x: 0.9, y: 0.1},   // 右上
                            {x: 0.5, y: 0.5},   // 中心
                            {x: 0.1, y: 0.9},   // 左下
                            {x: 0.9, y: 0.9},   // 右下
                            {x: 0.3, y: 0.5},   // 左中
                            {x: 0.7, y: 0.5},   // 右中
                            {x: 0.5, y: 0.3},   // 上中
                            {x: 0.5, y: 0.7}    // 下中
                        ];
                        
                        let colors = [];
                        
                        for (let point of points) {
                            let x = Math.floor(point.x * sampleSize);
                            let y = Math.floor(point.y * sampleSize);
                            
                            // 获取该点周围 5x5 区域的平均颜色
                            let r = 0, g = 0, b = 0, count = 0;
                            for (let dx = -2; dx <= 2; dx++) {
                                for (let dy = -2; dy <= 2; dy++) {
                                    let px = Math.max(0, Math.min(sampleSize - 1, x + dx));
                                    let py = Math.max(0, Math.min(sampleSize - 1, y + dy));
                                    let pixel = ctx.getImageData(px, py, 1, 1).data;
                                    r += pixel[0];
                                    g += pixel[1];
                                    b += pixel[2];
                                    count++;
                                }
                            }
                            
                            r = Math.round(r / count);
                            g = Math.round(g / count);
                            b = Math.round(b / count);
                            
                            let hex = '#' + 
                                r.toString(16).padStart(2, '0') +
                                g.toString(16).padStart(2, '0') +
                                b.toString(16).padStart(2, '0');
                            
                            colors.push(hex);
                        }
                        
                        // 去重并选择最有代表性的颜色
                        let uniqueColors = filterSimilarColors(colors);
                        resolve(uniqueColors);
                    };
                    img.src = 'data:image/png;base64,${base64}';
                });
            }
            
            // 过滤相似颜色，保留差异较大的颜色
            function filterSimilarColors(colors) {
                let result = [];
                let threshold = 50; // 颜色差异阈值
                
                for (let color of colors) {
                    let isDifferent = true;
                    for (let existing of result) {
                        if (colorDistance(color, existing) < threshold) {
                            isDifferent = false;
                            break;
                        }
                    }
                    if (isDifferent) {
                        result.push(color);
                    }
                }
                
                // 确保至少返回 3 个颜色
                if (result.length < 3) {
                    return colors.slice(0, 3);
                }
                
                return result.slice(0, 4); // 最多返回 4 个颜色
            }
            
            // 计算两个颜色的差异
            function colorDistance(c1, c2) {
                let r1 = parseInt(c1.slice(1, 3), 16);
                let g1 = parseInt(c1.slice(3, 5), 16);
                let b1 = parseInt(c1.slice(5, 7), 16);
                let r2 = parseInt(c2.slice(1, 3), 16);
                let g2 = parseInt(c2.slice(3, 5), 16);
                let b2 = parseInt(c2.slice(5, 7), 16);
                
                return Math.sqrt(
                    Math.pow(r1 - r2, 2) +
                    Math.pow(g1 - g2, 2) +
                    Math.pow(b1 - b2, 2)
                );
            }
            
            // 执行提取
            extractColors().then(colors => {
                window.extractedColors = JSON.stringify(colors);
            });
        </script>
    </body>
    </html>
    `;

  await webView.loadHTML(html);

  // 等待颜色提取完成
  let colors = null;
  for (let i = 0; i < 30; i++) {
    // 最多等待 3 秒
    await new Promise((r) => Timer.schedule(100, false, r));
    let result = await webView.evaluateJavaScript(
      "window.extractedColors || null"
    );
    if (result) {
      colors = JSON.parse(result);
      break;
    }
  }

  return colors;
}

// 调整颜色使其更适合作为背景（增加饱和度和对比度）
function enhanceColors(colors) {
  return colors.map((hex) => {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    // 转换为 HSL
    let hsl = rgbToHsl(r, g, b);

    // 调整：增加饱和度，调整亮度到适中范围
    hsl.s = Math.min(100, hsl.s * 1.2 + 10); // 增加饱和度
    hsl.l = Math.max(25, Math.min(65, hsl.l)); // 限制亮度范围

    return hslToHex(hsl.h, hsl.s, hsl.l);
  });
}

// RGB 转 HSL
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// HSL 转 HEX
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  r = Math.round((r + m) * 255)
    .toString(16)
    .padStart(2, "0");
  g = Math.round((g + m) * 255)
    .toString(16)
    .padStart(2, "0");
  b = Math.round((b + m) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${r}${g}${b}`;
}

// 默认配色方案
const DEFAULT_PALETTES = [
  ["#EE7B94", "#7BC2EE"],
  ["#FFFDF8", "#F5FAFF", "#0047FF", "#00AFFF"],
  ["#5FE387", "#00A0FC", "#AE6DD7", "#FF6892", "#E3C95F"],
];

// HEX 转 RGB
function hexToRgb(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// 使用 WebView 生成融合式渐变背景图片（柔和无网格）
async function createMeshGradientBackground(colors, width, height) {
  let webView = new WebView();

  // 将颜色数组转为 JSON 字符串
  let colorsJson = JSON.stringify(colors);

  // 使用 3x 分辨率获得更清晰的效果
  let scale = 3;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;">
        <canvas id="canvas" width="${width * scale}" height="${
    height * scale
  }"></canvas>
        <script>
            const COLORS = ${colorsJson};
            const CANVAS_WIDTH = ${width * scale};
            const CANVAS_HEIGHT = ${height * scale};
            
            // 柔和融合配置
            const BLOB_COUNT = 8;       // 柔光球数量
            const LINEAR_LAYERS = 3;    // 叠加线性渐变层数
            
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            
            function hexToRgb(hex) {
                let r = parseInt(hex.slice(1, 3), 16);
                let g = parseInt(hex.slice(3, 5), 16);
                let b = parseInt(hex.slice(5, 7), 16);
                return { r, g, b };
            }
            
            // 柔和融合渐变
            function generateSoftBlend() {
                // 基础底色
                ctx.fillStyle = COLORS[0];
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                // 叠加多层线性渐变，形成大范围色彩过渡
                for (let i = 0; i < LINEAR_LAYERS; i++) {
                    const c1 = COLORS[i % COLORS.length];
                    const c2 = COLORS[(i + 1) % COLORS.length];
                    const rgb1 = hexToRgb(c1);
                    const rgb2 = hexToRgb(c2);
                    
                    // 随机方向的线性渐变
                    const angle = Math.random() * Math.PI * 2;
                    const dx = Math.cos(angle) * CANVAS_WIDTH;
                    const dy = Math.sin(angle) * CANVAS_HEIGHT;
                    
                    const grad = ctx.createLinearGradient(
                        CANVAS_WIDTH / 2 - dx / 2,
                        CANVAS_HEIGHT / 2 - dy / 2,
                        CANVAS_WIDTH / 2 + dx / 2,
                        CANVAS_HEIGHT / 2 + dy / 2
                    );
                    
                    grad.addColorStop(0, 'rgba(' + rgb1.r + ', ' + rgb1.g + ', ' + rgb1.b + ', 0.65)');
                    grad.addColorStop(1, 'rgba(' + rgb2.r + ', ' + rgb2.g + ', ' + rgb2.b + ', 0.65)');
                    
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                }
                
                // 叠加柔光球，使颜色在局部区域融合
                for (let i = 0; i < BLOB_COUNT; i++) {
                    const hex = COLORS[Math.floor(Math.random() * COLORS.length)];
                    const c = hexToRgb(hex);
                    
                    const x = Math.random() * CANVAS_WIDTH;
                    const y = Math.random() * CANVAS_HEIGHT;
                    
                    // 半径控制：覆盖大区域，形成平滑过渡
                    const maxDim = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT);
                    const radius = (Math.random() * 0.5 + 0.45) * maxDim;
                    
                    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
                    g.addColorStop(0, 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', 0.55)');
                    g.addColorStop(0.6, 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', 0.25)');
                    g.addColorStop(1, 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', 0)');
                    
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                }
                
                // 轻微整体柔化处理（简单的透明蒙层）
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            }
            
            generateSoftBlend();
            
            // 导出为 base64（使用最高质量）
            window.meshGradientData = canvas.toDataURL('image/png', 1.0);
        </script>
    </body>
    </html>
    `;

  await webView.loadHTML(html);

  // 等待渲染完成
  let base64Data = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => Timer.schedule(100, false, r));
    let result = await webView.evaluateJavaScript(
      "window.meshGradientData || null"
    );
    if (result) {
      base64Data = result;
      break;
    }
  }

  if (base64Data) {
    // 移除 data:image/png;base64, 前缀
    let base64String = base64Data.replace(/^data:image\/png;base64,/, "");
    let imgData = Data.fromBase64String(base64String);
    return Image.fromData(imgData);
  }

  return null;
}

// 获取背景颜色
async function getBackgroundColors() {
  if (config.runsInWidget) {
    let fm = FileManager.local();
    let path = fm.joinPath(fm.documentsDirectory(), "widget-colors.json");
    if (fm.fileExists(path)) {
      try {
        let data = fm.readString(path);
        let colors = JSON.parse(data);
        // 验证颜色数组是否有效
        if (Array.isArray(colors) && colors.length > 0) {
          return colors;
        }
      } catch (e) {
        // 如果读取或解析失败，使用默认配色
      }
    }
    return DEFAULT_PALETTES[
      Math.floor(Math.random() * DEFAULT_PALETTES.length)
    ];
  }

  let alert = new Alert();
  alert.title = TEXTS.colorPicker.title;
  alert.message = TEXTS.colorPicker.message;
  alert.addAction(TEXTS.colorPicker.selectImage);
  alert.addCancelAction(TEXTS.colorPicker.useDefault);

  let choice = await alert.present();

  if (choice === 0) {
    let img = await Photos.fromLibrary();
    if (img) {
      // 使用 WebView 提取真实颜色
      let extractedColors = await extractRealColors(img);

      if (extractedColors && extractedColors.length >= 2) {
        // 增强颜色
        let colors = enhanceColors(extractedColors);

        // 保存颜色（确保数据被正确保存）
        let fm = FileManager.local();
        let path = fm.joinPath(fm.documentsDirectory(), "widget-colors.json");
        try {
          fm.writeString(path, JSON.stringify(colors));
        } catch (e) {
          console.error("保存颜色失败:", e);
        }

        return colors;
      }
    }
  }

  let defaultColors =
    DEFAULT_PALETTES[Math.floor(Math.random() * DEFAULT_PALETTES.length)];
  let fm = FileManager.local();
  let path = fm.joinPath(fm.documentsDirectory(), "widget-colors.json");
  try {
    fm.writeString(path, JSON.stringify(defaultColors));
  } catch (e) {
    console.error("保存默认颜色失败:", e);
  }

  return defaultColors;
}

// ===== 组件尺寸配置 =====
// 根据组件尺寸调整字体大小和布局
function getWidgetConfig(family) {
  switch (family) {
    case "small":
      return {
        width: 155,
        height: 155,
        titleFont: 11,
        numberFont: 32,
        subtitleFont: 10,
        padding: 12,
        spacing: 4,
      };
    case "large":
      return {
        width: 329,
        height: 345,
        titleFont: 16,
        numberFont: 64,
        subtitleFont: 14,
        padding: 20,
        spacing: 8,
      };
    case "medium":
    default:
      return {
        width: 329,
        height: 155,
        titleFont: 14,
        numberFont: 48,
        subtitleFont: 12,
        padding: 16,
        spacing: 6,
      };
  }
}

// ===== 主程序 =====

let widget = new ListWidget();

// 获取组件尺寸
let widgetFamily = config.widgetFamily || "medium";
let widgetConfig = getWidgetConfig(widgetFamily);

// 获取自定义标题
let widgetTitle = await getWidgetTitle();

// 获取起始日期并计算天数（每次都重新计算，确保使用最新日期）
let startDate = await getStartDate();
let today = new Date();
let dayCount = calculateDaysBetween(startDate, today);

let colors = await getBackgroundColors();

// 生成 Mesh Gradient 背景（每次都重新生成，确保刷新）
// 添加时间戳确保每次生成的背景都不同，强制刷新
let bgImage = await createMeshGradientBackground(
  colors,
  widgetConfig.width,
  widgetConfig.height
);
if (bgImage) {
  widget.backgroundImage = bgImage;
} else {
  // 如果生成失败，使用纯色背景
  widget.backgroundColor = new Color(colors[0]);
}

// 设置内边距
widget.setPadding(
  widgetConfig.padding,
  widgetConfig.padding,
  widgetConfig.padding,
  widgetConfig.padding
);

// 添加标题文本
let titleText = widget.addText(widgetTitle);
titleText.font = Font.boldSystemFont(widgetConfig.titleFont);
titleText.textColor = Color.white();
titleText.shadowColor = new Color("#000000", 0.5);
titleText.shadowRadius = 2;
titleText.textOpacity = 0.95;
titleText.minimumScaleFactor = 0.7;
titleText.lineLimit = 1;

widget.addSpacer();

// 中间内容区域
let centerStack = widget.addStack();
centerStack.layoutHorizontally();
centerStack.addSpacer();

// 添加天数和单位
let numberStack = centerStack.addStack();
numberStack.layoutHorizontally();
numberStack.centerAlignContent();

let numberText = numberStack.addText(formatNumber(dayCount));
numberText.font = Font.boldSystemFont(widgetConfig.numberFont);
numberText.textColor = Color.white();
numberText.shadowColor = new Color("#000000", 0.5);
numberText.shadowRadius = 3;
numberText.minimumScaleFactor = 0.5;
numberText.lineLimit = 1;

numberStack.addSpacer(widgetConfig.spacing);

let unitText = numberStack.addText(TEXTS.widget.subtitle);
unitText.font = Font.systemFont(widgetConfig.subtitleFont);
unitText.textColor = Color.white();
unitText.shadowColor = new Color("#000000", 0.5);
unitText.shadowRadius = 2;
unitText.textOpacity = 0.9;

centerStack.addSpacer();

widget.addSpacer();

if (config.runsInWidget) {
  // 组件模式：设置组件
  Script.setWidget(widget);
} else {
  // App 模式：预览时可以切换不同尺寸
  widget.presentMedium();

  // 在 App 模式下设置数据后，也尝试更新组件（如果已添加）
  // 这样可以确保添加到桌面后立即显示最新数据
  try {
    Script.setWidget(widget);
  } catch (e) {
    // 如果组件未添加，忽略错误
  }
}

Script.complete();
