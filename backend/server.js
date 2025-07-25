const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const showdown = require('showdown');
const multer = require('multer');
const https = require('https');
const http = require('http');
const fsp = require('fs/promises');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { Mutex } = require('async-mutex');

// 数据库和数据同步
const { testConnection } = require('./config/database');
const DataSyncService = require('./utils/dataSync').instance;

const app = express();
const port = 3001;
const converter = new showdown.Converter();

// Increase payload size limit for JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Credentials - CHANGE THESE IN PRODUCTION! ---
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'A$%&*9ASDG';

// --- File Paths ---
const frontendPath = path.join(__dirname, '..', 'frontend');
const dataDirectory = path.join(frontendPath, 'js', 'data');
const guidesDirectory = path.join(dataDirectory, 'guides');
const digimonDataPath = path.join(dataDirectory, 'digimon.json');
const evolutionsDataPath = path.join(dataDirectory, 'evolutions.json');
const equipmentDataPath = path.join(dataDirectory, 'equipment.json');
const changelogDataPath = path.join(dataDirectory, 'changelog.json');
const itemsDataPath = path.join(dataDirectory, 'items.json');
const synthesisDataPath = path.join(dataDirectory, 'synthesis.json');
const itemImagesRoot = path.join(frontendPath, 'js', 'data', 'guides', 'src', 'items');
const guidesFilePath = path.join(dataDirectory, 'guides.json');

const fileMutexes = {
    guides: new Mutex(),
    digimon: new Mutex(),
    evolutions: new Mutex(),
    equipment: new Mutex(),
    changelog: new Mutex(),
    items: new Mutex(),
    synthesis: new Mutex(),
};

// Setup upload directories
const uploadsDir = path.join(__dirname, 'public/uploads');
const tempGuidesUploadsDir = path.join(uploadsDir, 'temp_guides');
const finalGuidesUploadsDir = path.join(uploadsDir, 'guides');
const equipmentUploadsDir = path.join(uploadsDir, 'equipment');
fs.ensureDirSync(equipmentUploadsDir);
fs.ensureDirSync(tempGuidesUploadsDir);
fs.ensureDirSync(finalGuidesUploadsDir);

// 确保@目录存在
const ensureAtSymbolDir = () => {
    const atSymbolDirPath = path.join(dataDirectory, '@/');
    fs.ensureDirSync(atSymbolDirPath);
};

// Enable CORS for all routes
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// --- Session Middleware ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key-that-you-should-change',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if you are using HTTPS
        httpOnly: true,
        // maxAge will be set on login
    }
}));

// --- Authentication Middleware ---
function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    } else {
        // For API requests, send a 401. 
        res.status(401).json({ message: 'Unauthorized' });
    }
}

// --- Protected Route for Admin Panel ---
// This must come BEFORE express.static to intercept the request
app.get('/admin', (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
        // If authenticated, let express.static find and serve admin.html
        return next(); 
    }
    // If not authenticated, redirect to login page
    res.redirect('/login');
});

// 图片格式和路径自动匹配中间件
app.use('/js/data/guides/src', (req, res, next) => {
    // 解码URL编码的路径
    const decodedPath = decodeURIComponent(req.path);
    const fullPath = path.join(frontendPath, 'js/data/guides/src', decodedPath);

    // 如果请求的文件存在，直接继续
    if (fs.existsSync(fullPath)) {
        return res.sendFile(fullPath);
    }

    // 如果请求的是图片文件，尝试其他格式和子目录搜索
    const ext = path.extname(decodedPath).toLowerCase();
    if (['.webp', '.jpg', '.jpeg', '.png'].includes(ext)) {
        const fileNameWithoutExt = path.basename(decodedPath, ext);
        const requestDir = path.dirname(decodedPath);

        // 搜索函数
        const searchInDirectory = (searchDir) => {
            if (!fs.existsSync(searchDir)) return null;

            try {
                const items = fs.readdirSync(searchDir, { withFileTypes: true });

                // 先在当前目录搜索
                for (const item of items) {
                    if (item.isFile()) {
                        const itemPath = path.join(searchDir, item.name);
                        const itemExt = path.extname(item.name).toLowerCase();
                        const itemNameWithoutExt = path.basename(item.name, itemExt);

                        // 检查文件名匹配（忽略扩展名）
                        if (itemNameWithoutExt === fileNameWithoutExt &&
                            ['.webp', '.jpg', '.jpeg', '.png'].includes(itemExt)) {
                            return itemPath;
                        }
                    }
                }

                // 然后在子目录中搜索
                for (const item of items) {
                    if (item.isDirectory()) {
                        const subDirPath = path.join(searchDir, item.name);
                        const found = searchInDirectory(subDirPath);
                        if (found) return found;
                    }
                }
            } catch (error) {
                console.error(`搜索目录失败: ${searchDir}`, error.message);
            }

            return null;
        };

        // 开始搜索
        const baseSearchDir = path.join(frontendPath, 'js/data/guides/src', requestDir);
        let foundPath = searchInDirectory(baseSearchDir);

        if (foundPath) {
            return res.sendFile(foundPath);
        }

        // 简化的错误日志
        console.log(`❌ 图片未找到: ${decodedPath}`);
        return res.status(404).send('Image not found');
    }

    next();
});

// Serve static files from the 'frontend' directory
app.use(express.static(frontendPath, {
    // We handle the /admin route manually above
    extensions: ['html'],
    redirect: false
}));

// --- Login/Logout Routes ---
app.post('/api/login', (req, res) => {
    const { username, password, rememberMe } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        
        // Handle "Remember Me" functionality
        if (rememberMe) {
            // Set a persistent cookie by setting maxAge
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        } else {
            // It's a session cookie, will be deleted when browser closes
            req.session.cookie.expires = false;
        }

        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid username or password' });
    }
});

app.post('/api/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).json({ message: 'Could not log out.' });
            } else {
                res.clearCookie('connect.sid'); // Clears the session cookie
                return res.status(200).json({ message: 'Logout successful' });
            }
        });
    } else {
        res.status(200).json({ message: 'Already logged out' });
    }
});

// --- Multer configuration for guide image uploads ---
const guidesImagePath = path.join(guidesDirectory, 'src', 'guide');
const tempImagePath = path.join(guidesImagePath, 'temp');
fs.ensureDirSync(guidesImagePath);
fs.ensureDirSync(tempImagePath);

const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempGuidesUploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `temp-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: tempStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});
const itemImageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const category = req.query.category;
        if (!category) {
            return cb(new Error('Category is required for item image upload.'));
        }
        const uploadPath = path.join(itemImagesRoot, category);
        fs.ensureDirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Sanitize filename and make it unique
        const originalName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${originalName}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadItemImage = multer({ 
    storage: itemImageStorage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});
app.post('/api/upload/temp', requireAuth, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'Please upload a file.' });
    }
    const relativePath = `/uploads/temp_guides/${req.file.filename}`;
    res.status(200).json({ url: relativePath, filename: req.file.filename });
});


// --- Digimon & Evolutions API ---

// Helper function to read Digimon data
const readDigimonData = async () => {
    try {
        if (fs.existsSync(digimonDataPath)) {
            return await fs.readJson(digimonDataPath);
        }
        return []; // Return empty array if file doesn't exist
    } catch (error) {
        console.error('Error reading Digimon data:', error);
        return [];
    }
};

// Helper function to write Digimon data
const writeDigimonData = async (data) => {
    const release = await fileMutexes.digimon.acquire();
    try {
        await fs.writeJson(digimonDataPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Error writing Digimon data:', error);
    } finally {
        release();
    }
};

// Helper function to read Evolutions data
const readEvolutionsData = async () => {
    try {
        if (fs.existsSync(evolutionsDataPath)) {
            return await fs.readJson(evolutionsDataPath);
        }
        return {}; // Return empty object if file doesn't exist
    } catch (error) {
        console.error('Error reading Evolutions data:', error);
        return {};
    }
};

// Helper function to write Evolutions data
const writeEvolutionsData = async (data) => {
    const release = await fileMutexes.evolutions.acquire();
    try {
        await fs.writeJson(evolutionsDataPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Error writing Evolutions data:', error);
    } finally {
        release();
    }
};

// API to get all Digimon (支持数据库读取)
app.get('/api/digimons', async (req, res) => {
    try {
        const data = await DataSyncService.readData('digimons');
        res.json(data);
    } catch (error) {
        console.error('获取数码兽数据失败:', error);
        res.status(500).json({ error: '获取数码兽数据失败', details: error.message });
    }
});

// API to create a new Digimon (支持双写模式)
app.post('/api/digimons', requireAuth, async (req, res) => {
    try {
        console.log('🔄 POST /api/digimons 被调用');
        console.log('请求数据:', JSON.stringify(req.body, null, 2));

        const newDigimon = req.body;

        if (!newDigimon.id || !newDigimon.name) {
            return res.status(400).json({ message: 'ID and Name are required.' });
        }

        // 检查是否已存在（从当前数据源）
        const existingDigimons = await DataSyncService.readData('digimons');
        if (Array.isArray(existingDigimons) && existingDigimons.some(d => d.id === newDigimon.id)) {
            return res.status(400).json({ message: `Digimon with ID "${newDigimon.id}" already exists.` });
        }

        // Process image: download if it's a URL, otherwise ensure absolute path
        newDigimon.image = await processImageField(newDigimon.image, DIGIMON_DETAILS_ROOT, newDigimon.id);

        // 双写模式：同时写入数据库和JSON
        console.log('准备写入数码兽数据:', JSON.stringify(newDigimon, null, 2));
        const writeResult = await DataSyncService.writeData('digimons', newDigimon);
        console.log('数码兽写入结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 数码兽创建成功');
            res.status(201).json(newDigimon);
        } else {
            console.log('❌ 数码兽创建失败');
            res.status(500).json({
                message: '数据保存失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('创建数码兽失败:', error);
        res.status(500).json({ error: '创建数码兽失败', details: error.message });
    }
});

// API to update a Digimon (支持双写模式)
app.put('/api/digimons/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedDigimonData = req.body;

        // 检查数码兽是否存在
        const existingDigimons = await DataSyncService.readData('digimons');
        const existingDigimon = Array.isArray(existingDigimons)
            ? existingDigimons.find(d => d.id === id)
            : null;

        if (!existingDigimon) {
            return res.status(404).json({ message: 'Digimon not found.' });
        }

        // Process image: download if it's a URL, otherwise ensure absolute path
        updatedDigimonData.image = await processImageField(updatedDigimonData.image, DIGIMON_DETAILS_ROOT, id);

        // 合并数据
        const updatedDigimon = { ...existingDigimon, ...updatedDigimonData };

        // 双写模式：同时更新数据库和JSON
        const writeResult = await DataSyncService.writeData('digimons', updatedDigimon, id);

        if (writeResult.success) {
            res.json(updatedDigimon);
        } else {
            res.status(500).json({
                message: '数据更新失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('更新数码兽失败:', error);
        res.status(500).json({ error: '更新数码兽失败', details: error.message });
    }
});

// API to delete a Digimon (支持双写模式)
app.delete('/api/digimons/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/digimons/:id 被调用');
        console.log('要删除的ID:', req.params.id);

        const { id } = req.params;

        // 检查数码兽是否存在（从当前数据源）
        const existingDigimons = await DataSyncService.readData('digimons');
        const digimonExists = Array.isArray(existingDigimons)
            ? existingDigimons.some(d => d.id === id)
            : false;

        if (!digimonExists) {
            return res.status(404).json({ message: 'Digimon not found.' });
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('digimons', id);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 数码兽删除成功');
            res.status(200).json({ message: 'Digimon deleted successfully.' });
        } else {
            console.log('❌ 数码兽删除失败');
            res.status(500).json({
                message: '数码兽删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除数码兽失败:', error);
        res.status(500).json({ error: '删除数码兽失败', details: error.message });
    }
});

// API to get all Evolutions (支持数据库读取)
app.get('/api/evolutions', async (req, res) => {
    try {
        const data = await DataSyncService.readData('evolutions');
        res.json(data);
    } catch (error) {
        console.error('获取进化数据失败:', error);
        res.status(500).json({ error: '获取进化数据失败', details: error.message });
    }
});

// API to create a new Evolution (支持双写模式)
app.post('/api/evolutions', requireAuth, async (req, res) => {
    try {
        console.log('🔄 POST /api/evolutions 被调用');
        console.log('请求数据:', JSON.stringify(req.body, null, 2));

        const { id, data } = req.body;

        if (!id || !data) {
            return res.status(400).json({ message: 'Evolution ID and data are required.' });
        }

        // 检查是否已存在（从当前数据源）
        const existingEvolutions = await DataSyncService.readData('evolutions');
        if (existingEvolutions && existingEvolutions[id]) {
            return res.status(400).json({ message: `Evolution with ID "${id}" already exists.` });
        }

    await processEvolutionImages(data, id);

        // 双写模式：同时写入数据库和JSON
        const evolutionData = { id, ...data };
        console.log('准备写入的数据:', JSON.stringify(evolutionData, null, 2));

        // POST请求是创建操作，不传id参数让DataSyncService知道这是创建
        const writeResult = await DataSyncService.writeData('evolutions', evolutionData);
        console.log('写入结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 进化数据创建成功');
            res.status(201).json(data);
        } else {
            console.log('❌ 进化数据创建失败');
            res.status(500).json({
                message: '进化数据保存失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('创建进化数据失败:', error);
        res.status(500).json({ error: '创建进化数据失败', details: error.message });
    }
});

// API to update an Evolution (支持双写模式)
app.put('/api/evolutions/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 PUT /api/evolutions/:id 被调用');
        console.log('原始ID:', req.params.id);
        console.log('请求数据:', JSON.stringify(req.body, null, 2));

        const originalId = req.params.id;
        const { id: newId, data: updatedData } = req.body;

        // 检查原始进化是否存在
        const existingEvolutions = await DataSyncService.readData('evolutions');
        if (!existingEvolutions || !existingEvolutions[originalId]) {
            return res.status(404).json({ message: `Evolution with ID "${originalId}" not found.` });
        }

        // 如果ID发生变化，检查新ID是否冲突
        if (originalId !== newId) {
            if (existingEvolutions[newId]) {
                return res.status(400).json({ message: `Cannot rename to "${newId}" as it already exists.` });
            }
        }

        // 处理进化图片
        await processEvolutionImages(updatedData, newId);

        // 双写模式：同时更新数据库和JSON
        const evolutionData = { id: newId, ...updatedData };
        const writeResult = await DataSyncService.writeData('evolutions', evolutionData, newId);

        // 如果ID发生了变化，需要删除旧的记录
        if (originalId !== newId && writeResult.success) {
            // TODO: 实现删除旧记录的功能
            console.log(`进化ID从 ${originalId} 更改为 ${newId}`);
        }

        if (writeResult.success) {
            res.json(updatedData);
        } else {
            res.status(500).json({
                message: '进化数据更新失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('更新进化数据失败:', error);
        res.status(500).json({ error: '更新进化数据失败', details: error.message });
    }
});

// API to delete an Evolution (支持双写模式)
app.delete('/api/evolutions/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/evolutions/:id 被调用');
        console.log('要删除的ID:', req.params.id);

        const { id } = req.params;

        // 检查进化是否存在（从当前数据源）
        const existingEvolutions = await DataSyncService.readData('evolutions');
        if (!existingEvolutions || !existingEvolutions[id]) {
            return res.status(404).json({ message: `Evolution with ID "${id}" not found.` });
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('evolutions', id);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 进化数据删除成功');
            res.status(200).json({ message: 'Evolution deleted successfully.' });
        } else {
            console.log('❌ 进化数据删除失败');
            res.status(500).json({
                message: '进化数据删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除进化数据失败:', error);
        res.status(500).json({ error: '删除进化数据失败', details: error.message });
    }
});


// --- Guides API (largely unchanged) ---

const guideCategories = ['gameplay', 'area', 'boss'];

// Ensure guide category JSON files exist
fs.ensureDirSync(guidesDirectory);
guideCategories.forEach(category => {
    const filePath = path.join(guidesDirectory, `${category}.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeJsonSync(filePath, []); // Changed to simple array
    }
});

// Helper to read all guides
const readAllGuides = async () => {
    try {
        if (!fs.existsSync(guidesFilePath)) {
            console.warn(`[Server Warning] File not found: ${guidesFilePath}. Returning empty array.`);
            return [];
        }
        const allGuides = await fs.readJson(guidesFilePath);
        return allGuides.map(g => ({
            ...g,
            contentType: g.contentType || 'html',
            status: g.status || 'published'
        }));
    } catch (error) {
        console.error('Error reading guides.json:', error);
        return [];
    }
};

// Helper to write guides back
const writeGuides = async (guides) => {
    const release = await fileMutexes.guides.acquire();
    try {
        await fs.writeJson(guidesFilePath, guides, { spaces: 2 });
    } catch (error) {
        console.error('Error writing guides.json:', error);
        throw error;
    } finally {
        release();
    }
};

// GET /api/guides (for public)
// This API endpoint is no longer needed as the frontend fetches the JSON file directly.
// app.get('/api/guides', async (req, res) => {
//     const guides = await readAllGuides();
//     res.json(guides.filter(g => g.status === 'published'));
// });

// GET /api/admin/guides (for admin panel - 支持双读模式)
app.get('/api/admin/guides', requireAuth, async (req, res) => {
    try {
        console.log('🔄 GET /api/admin/guides 被调用');

        // 使用DataSyncService读取数据（双读模式）
        const guides = await DataSyncService.readData('guides');
        console.log(`📖 读取到 ${guides.length} 条攻略记录`);

        // 确保每个攻略都有必要的字段
        const formattedGuides = guides.map(g => ({
            ...g,
            contentType: g.contentType || 'html',
            status: g.status || 'published'
        }));

        res.json(formattedGuides);
    } catch (error) {
        console.error('获取攻略列表失败:', error);

        // 降级到JSON文件读取
        console.log('⚠️  降级到JSON文件读取');
        const guides = await readAllGuides();
        res.json(guides);
    }
});

// GET /api/guides/:slug
app.get('/api/guides/:slug', async (req, res) => {
    const { raw } = req.query;
    const guides = await readAllGuides();
    let guide = guides.find(g => g.slug === req.params.slug);
    if (guide) {
        if (guide.status !== 'published' && !raw) {
            return res.status(404).json({ message: 'Guide not found' });
        }
        if (!raw && guide.contentType === 'markdown' && guide.content) {
            guide.content = converter.makeHtml(guide.content);
        }
        res.json(guide);
    } else {
        res.status(404).json({ message: 'Guide not found' });
    }
});

// POST /api/guides
app.post('/api/guides', requireAuth, async (req, res) => {
    let allGuides = await readAllGuides();
    const newGuide = req.body;
    const { tempFiles, category, slug } = newGuide;

    if (!slug || !category) {
        return res.status(400).json({ message: 'Slug and category are required.' });
    }
    if (allGuides.some(g => g.slug === slug)) {
        return res.status(400).json({ message: `Slug "${slug}" already exists.` });
    }
    
    if (tempFiles && tempFiles.length > 0) {
        const finalImageDir = path.join(finalGuidesUploadsDir, category, slug);
        fs.ensureDirSync(finalImageDir);
        let updatedContent = newGuide.content;

        for (const tempFilename of tempFiles) {
            const tempFilePath = path.join(tempGuidesUploadsDir, tempFilename);
            if (fs.existsSync(tempFilePath)) {
                const finalFilename = tempFilename.replace(/^temp-/, '');
                const finalFilePath = path.join(finalImageDir, finalFilename);
                await fs.move(tempFilePath, finalFilePath);
                
                const finalRelativeUrl = `/uploads/guides/${category}/${slug}/${finalFilename}`;
                const tempRelativeUrl = `/uploads/temp_guides/${tempFilename}`;
                const pathRegex = new RegExp(tempRelativeUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                
                updatedContent = updatedContent.replace(pathRegex, finalRelativeUrl);
            }
        }
        newGuide.content = updatedContent;
    }
    
    const maxId = allGuides.reduce((max, g) => (g.id > max ? g.id : max), 0);
    newGuide.id = maxId + 1;
    newGuide.status = newGuide.status || 'draft'; 
    delete newGuide.tempFiles; 

    // 双写模式：同时写入数据库和JSON
    console.log('🔄 POST /api/guides 被调用');
    console.log('攻略slug:', newGuide.slug);

    const writeResult = await DataSyncService.writeData('guides', newGuide);
    console.log('写入结果:', writeResult);

    if (writeResult.success) {
        console.log('✅ 攻略创建成功');
        res.status(201).json(newGuide);
    } else {
        console.log('❌ 攻略创建失败');
        res.status(500).json({
            message: '攻略创建失败',
            details: writeResult
        });
    }
});

// PUT /api/guides/:slug
app.put('/api/guides/:slug', requireAuth, async (req, res) => {
    const { slug } = req.params;
    const updatedGuideData = req.body;
    const { tempFiles, category, slug: newSlug } = updatedGuideData;
    let allGuides = await readAllGuides();
    
    const guideIndex = allGuides.findIndex(g => g.slug === slug);
    if (guideIndex === -1) return res.status(404).json({ message: 'Guide not found' });

    const originalGuide = { ...allGuides[guideIndex] };
    
    // Process new temporary images
    if (tempFiles && tempFiles.length > 0) {
        const finalImageDir = path.join(finalGuidesUploadsDir, category, newSlug);
        fs.ensureDirSync(finalImageDir);
        let updatedContent = updatedGuideData.content;

        for (const tempFilename of tempFiles) {
            const tempFilePath = path.join(tempGuidesUploadsDir, tempFilename);
            if (fs.existsSync(tempFilePath)) {
                const finalFilename = tempFilename.replace(/^temp-/, '');
                const finalFilePath = path.join(finalImageDir, finalFilename);
                await fs.move(tempFilePath, finalFilePath);
                
                const finalRelativeUrl = `/uploads/guides/${category}/${newSlug}/${finalFilename}`;
                const tempRelativeUrl = `/uploads/temp_guides/${tempFilename}`;
                const pathRegex = new RegExp(tempRelativeUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                
                updatedContent = updatedContent.replace(pathRegex, finalRelativeUrl);
            }
        }
        updatedGuideData.content = updatedContent;
    }

    // Move image folder if slug or category changed
    const oldImageDir = path.join(finalGuidesUploadsDir, originalGuide.category, originalGuide.slug);
    if ((slug !== newSlug || originalGuide.category !== category) && fs.existsSync(oldImageDir)) {
        const newImageDir = path.join(finalGuidesUploadsDir, category, newSlug);
        
        fs.ensureDirSync(path.dirname(newImageDir));
        await fs.move(oldImageDir, newImageDir, { overwrite: true });
        
        const oldBasePath = `/uploads/guides/${originalGuide.category}/${originalGuide.slug}`;
        const newBasePath = `/uploads/guides/${category}/${newSlug}`;
        const pathUpdateRegex = new RegExp(oldBasePath.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        updatedGuideData.content = (updatedGuideData.content || originalGuide.content).replace(pathUpdateRegex, newBasePath);
    }
    
    // Merge data and save
    const finalGuide = { ...originalGuide, ...updatedGuideData };
    delete finalGuide.tempFiles;

    // 双写模式：同时更新数据库和JSON
    console.log('🔄 PUT /api/guides/:slug 被调用');
    console.log('攻略slug:', slug, '->', newSlug);

    const writeResult = await DataSyncService.writeData('guides', finalGuide, finalGuide.id);
    console.log('更新结果:', writeResult);

    if (writeResult.success) {
        console.log('✅ 攻略更新成功');
        res.json(finalGuide);
    } else {
        console.log('❌ 攻略更新失败');
        res.status(500).json({
            message: '攻略更新失败',
            details: writeResult
        });
    }
});

// DELETE /api/guides/:slug (soft delete - 支持双写模式)
app.delete('/api/guides/:slug', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/guides/:slug 被调用 (软删除)');
        console.log('要删除的slug:', req.params.slug);

        const { slug } = req.params;

        // 检查攻略是否存在（从当前数据源）
        const existingGuides = await DataSyncService.readData('guides');
        const guideToUpdate = Array.isArray(existingGuides)
            ? existingGuides.find(g => g.slug === slug)
            : null;

        if (!guideToUpdate) {
            return res.status(404).json({ message: 'Guide not found' });
        }

        // 软删除：更改状态为 'trashed'
        const updatedGuide = { ...guideToUpdate, status: 'trashed' };

        // 调试：检查ID值
        console.log('🔍 guideToUpdate.id:', guideToUpdate.id, '(type:', typeof guideToUpdate.id, ')');
        console.log('🔍 guideToUpdate.original_id:', guideToUpdate.original_id);
        console.log('🔍 guideToUpdate.slug:', guideToUpdate.slug);

        // 双写模式：同时更新数据库和JSON，使用slug作为ID
        const updateResult = await DataSyncService.writeData('guides', updatedGuide, slug);
        console.log('软删除结果:', updateResult);

        if (updateResult.success) {
            console.log('✅ 攻略软删除成功');
            res.status(200).json({ message: 'Guide moved to trash' });
        } else {
            console.log('❌ 攻略软删除失败');
            res.status(500).json({
                message: '攻略软删除失败',
                details: updateResult
            });
        }
    } catch (error) {
        console.error('攻略软删除失败:', error);
        res.status(500).json({ error: '攻略软删除失败', details: error.message });
    }
});

// PUT /api/guides/:slug/restore (to restore from trash) - 支持双写模式
app.put('/api/guides/:slug/restore', requireAuth, async (req, res) => {
    const { slug } = req.params;

    try {
        console.log('🔄 PUT /api/guides/:slug/restore 被调用');
        console.log('恢复攻略slug:', slug);

        // 使用DataSyncService读取数据
        const allGuides = await DataSyncService.readData('guides');
        const guide = allGuides.find(g => g.slug === slug && g.status === 'trashed');

        if (!guide) {
            console.log('❌ 未找到已删除的攻略:', slug);
            return res.status(404).json({ message: 'Trashed guide not found' });
        }

        // 更新状态为草稿
        const updatedGuide = { ...guide, status: 'draft' };

        // 调试：检查ID值
        console.log('🔍 guide.id:', guide.id, '(type:', typeof guide.id, ')');
        console.log('🔍 guide.original_id:', guide.original_id);
        console.log('🔍 guide.slug:', guide.slug);

        // 直接使用slug进行更新
        console.log('使用slug进行更新:', slug);

        // 使用双写模式更新
        const writeResult = await DataSyncService.writeData('guides', updatedGuide, slug);
        console.log('恢复结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 攻略恢复成功');
            res.status(200).json({
                message: 'Guide restored successfully',
                guide: updatedGuide
            });
        } else {
            console.log('❌ 攻略恢复失败');
            res.status(500).json({
                message: '攻略恢复失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('恢复攻略时出错:', error);
        res.status(500).json({
            message: '恢复攻略时出错',
            error: error.message
        });
    }
});

// DELETE /api/guides/:slug/permanent (永久删除 - 支持双写模式)
app.delete('/api/guides/:slug/permanent', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/guides/:slug/permanent 被调用 (永久删除)');
        console.log('要删除的slug:', req.params.slug);

        const { slug } = req.params;

        // 检查攻略是否存在（从当前数据源）
        const existingGuides = await DataSyncService.readData('guides');
        const guideToDelete = Array.isArray(existingGuides)
            ? existingGuides.find(g => g.slug === slug)
            : null;

        if (!guideToDelete) {
            return res.status(404).json({ message: 'Guide not found' });
        }

        // 删除关联的图片文件夹
        const imageDir = path.join(finalGuidesUploadsDir, guideToDelete.category, guideToDelete.slug);
        if (fs.existsSync(imageDir)) {
            await fs.remove(imageDir);
            console.log(`Permanently deleted image folder: ${imageDir}`);
        }

        // 双写模式：同时从数据库和JSON删除
        // 传递slug而不是ID，因为deleteGuide方法需要slug来查找记录
        const deleteResult = await DataSyncService.deleteData('guides', slug);
        console.log('永久删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 攻略永久删除成功');
            res.status(200).json({ message: 'Guide permanently deleted' });
        } else {
            console.log('❌ 攻略永久删除失败');
            res.status(500).json({
                message: '攻略永久删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('攻略永久删除失败:', error);
        res.status(500).json({ error: '攻略永久删除失败', details: error.message });
    }
});

// --- Equipment API Endpoints ---
// Helper function to read Equipment data
const readEquipmentData = async () => {
    try {
        if (fs.existsSync(equipmentDataPath)) {
            return await fs.readJson(equipmentDataPath);
        }
        return []; // Return empty array if file doesn't exist
    } catch (error) {
        console.error('Error reading Equipment data:', error);
        return [];
    }
};

// Helper function to write Equipment data
const writeEquipmentData = async (data) => {
    const release = await fileMutexes.equipment.acquire();
    try {
        await fs.writeJson(equipmentDataPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Error writing Equipment data:', error);
        throw error;
    } finally {
        release();
    }
};

const EQUIPMENT_IMAGE_ROOT = path.join(__dirname, '..', 'frontend', 'js', 'data', 'guides', 'src', 'equipment');
fs.ensureDirSync(EQUIPMENT_IMAGE_ROOT);

// --- Image Processing Helpers ---
const DIGIMON_DETAILS_ROOT = path.join(frontendPath, 'js', 'data', 'guides', 'src', 'digimon', 'details_digimons');
const DIGIMON_EVOLUTIONS_ROOT = path.join(frontendPath, 'js', 'data', 'guides', 'src', 'digimon');
fs.ensureDirSync(DIGIMON_DETAILS_ROOT);
fs.ensureDirSync(DIGIMON_EVOLUTIONS_ROOT);

const ensureAbsoluteUrl = (url) => {
    if (typeof url !== 'string' || !url) {
        return url;
    }
    const localhostOrigin = `http://localhost:${port}`;
    if (url.startsWith(localhostOrigin)) {
        return url.substring(localhostOrigin.length);
    }
    // If it's another absolute URL, leave it.
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    // Otherwise, it's a relative path. Ensure it starts with a `/`.
    return url.startsWith('/') ? url : `/${url}`;
};

async function downloadAndSaveImage(url, targetDir, targetFilename) {
    await fs.ensureDir(targetDir); // Ensure the directory exists
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download image: ${res.statusCode} from ${url}`));
            }
            const contentType = res.headers['content-type'];
            const ext = contentType ? `.${contentType.split('/')[1]}` : (path.extname(new URL(url).pathname) || '.png');
            
            const finalFilename = `${targetFilename}${ext}`;
            const savePath = path.join(targetDir, finalFilename);
            const writeStream = fs.createWriteStream(savePath);
            res.pipe(writeStream);
            writeStream.on('finish', () => {
                const relativePath = `/${path.relative(frontendPath, savePath).replace(/\\/g, '/')}`;
                resolve(relativePath);
            });
            writeStream.on('error', (err) => reject(new Error(`Failed to write image to disk: ${err.message}`)));
        }).on('error', (err) => reject(new Error(`Failed to fetch image URL: ${err.message}`)));
    });
}

async function processImageField(url, targetDir, targetFilename) {
    if (typeof url !== 'string' || !url) {
        return url;
    }
    
    // If it is a remote URL (and not one of our own), download it.
    if (url.startsWith('http') && !url.startsWith(`http://localhost:${port}`)) {
        try {
            // We pass the filename without extension to downloadAndSaveImage
            const filenameWithoutExt = targetFilename.split('.').slice(0, -1).join('.') || targetFilename;
            return await downloadAndSaveImage(url, targetDir, filenameWithoutExt);
        } catch (error) {
            console.error(`Failed to download ${url}: ${error.message}`);
            return url; // On error, return original URL
        }
    }
    
    // Otherwise, it's a local path. Ensure it's an absolute URL.
    return ensureAbsoluteUrl(url);
}

// Helper to process all images within an evolution object
async function processEvolutionImages(evolutionData, evolutionId) {
    const evolutionDir = path.join(DIGIMON_EVOLUTIONS_ROOT, evolutionId);
    fs.ensureDirSync(evolutionDir);

    const processUrl = async (url) => {
        if (typeof url !== 'string' || !url) {
            return url;
        }
        
        // Only download and process new, external URLs.
        if (url.startsWith('http') && !url.startsWith(`http://localhost:${port}`)) {
            const filename = path.basename(new URL(url).pathname, path.extname(new URL(url).pathname)) || 'image';
            // It's a new external image, download it.
            return processImageField(url, evolutionDir, `${filename}-${Date.now()}`);
        }
        
        // It's an existing local URL (relative or absolute), just ensure it's absolute.
        return ensureAbsoluteUrl(url);
    };
    
    // Process single image fields in card
    if (evolutionData.card) {
        evolutionData.card.image = await processUrl(evolutionData.card.image);
    }

    // Process comma-separated image URLs in card
    if (evolutionData.card && evolutionData.card.evolution_images) {
        const urls = evolutionData.card.evolution_images.split(',').map(s => s.trim()).filter(Boolean);
        const processedUrls = await Promise.all(urls.map(u => processUrl(u.trim())));
        evolutionData.card.evolution_images = processedUrls.join(',');
    }

    // Process stages array
    if (evolutionData.stages) {
        for (const stage of evolutionData.stages) {
            stage.image = await processUrl(stage.image);
        }
    }
}

async function processAndSaveImages(dungeonData, dungeonId) {
    const dungeonDir = path.join(EQUIPMENT_IMAGE_ROOT, dungeonId);
    fs.ensureDirSync(dungeonDir);

    const processSingleImage = async (imageUrl) => {
        if (typeof imageUrl !== 'string' || !imageUrl) {
            return imageUrl;
        }

        // Only download and process new, external URLs.
        if (imageUrl.startsWith('http') && !imageUrl.startsWith(`http://localhost:${port}`)) {
            const baseName = path.basename(new URL(imageUrl).pathname, path.extname(new URL(imageUrl).pathname)) || 'equipment';
            return processImageField(imageUrl, dungeonDir, `${baseName}-${Date.now()}`);
        }

        // It's an existing local URL, just ensure it's absolute.
        return ensureAbsoluteUrl(imageUrl);
    };

    // Main dungeon icon
    if (dungeonData.dungeonImage) {
        dungeonData.dungeonImage = await processSingleImage(dungeonData.dungeonImage);
    }

    // Equipment sets
    if (dungeonData.equipmentSets) {
        for (const set of dungeonData.equipmentSets) {
            if (set.items) {
                for (const item of set.items) {
                    if (item.icon) {
                        item.icon = await processSingleImage(item.icon);
                    }
                }
            }
        }
    }

    // Loose items
    if (dungeonData.looseItems) {
        for (const item of dungeonData.looseItems) {
            if (item.icon) {
                item.icon = await processSingleImage(item.icon);
            }
        }
    }
}

// 定义有效的装备类型
const VALID_EQUIPMENT_TYPES = [
  '数码之魂',
  '万能插件',
  '防御插件',
  '攻击插件',
  '速度插件'
];

// API to get all Equipment (支持双读模式)
app.get('/api/equipment', async (req, res) => {
    try {
        console.log('🔄 GET /api/equipment 被调用');

        // 使用DataSyncService读取数据（双读模式）
        const data = await DataSyncService.readData('equipment');
        console.log(`📖 读取到 ${data.length} 条装备记录`);

        res.json(data);
    } catch (error) {
        console.error('获取装备数据失败:', error);

        // 降级到JSON文件读取
        console.log('⚠️  降级到JSON文件读取');
        try {
            const data = await readEquipmentData();
            res.json(data);
        } catch (fallbackError) {
            console.error('JSON文件读取也失败:', fallbackError);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// API to get a single dungeon's equipment data
app.get('/api/equipment/dungeons/:dungeonId', async (req, res) => {
    try {
        const { dungeonId } = req.params;
        const data = await readEquipmentData();
        const dungeon = data.find(d => d.dungeonId === dungeonId);
        
        if (!dungeon) {
            return res.status(404).json({ message: `Dungeon with ID "${dungeonId}" not found.` });
        }
        
        res.json(dungeon);
    } catch (error) {
        console.error('Error getting dungeon data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// API to create a new dungeon
app.post('/api/equipment/dungeons', requireAuth, async (req, res) => {
    try {
        const newDungeon = req.body;
        const data = await readEquipmentData();
        
        if (!newDungeon.dungeonId || !newDungeon.dungeonName) {
            return res.status(400).json({ message: 'Dungeon ID and name are required.' });
        }
        
        if (data.some(d => d.dungeonId === newDungeon.dungeonId)) {
            return res.status(400).json({ message: `Dungeon with ID "${newDungeon.dungeonId}" already exists.` });
        }

        // 验证装备类型
        const validateEquipmentType = (items) => {
            if (!Array.isArray(items)) return true;
            return items.every(item => VALID_EQUIPMENT_TYPES.includes(item.type));
        };

        // 验证套装装备类型
        if (newDungeon.equipmentSets) {
            for (const set of newDungeon.equipmentSets) {
                if (!validateEquipmentType(set.items)) {
                    return res.status(400).json({ 
                        message: '无效的装备类型。有效类型：' + VALID_EQUIPMENT_TYPES.join(', ') 
                    });
                }
            }
        }

        // 验证散件装备类型
        if (!validateEquipmentType(newDungeon.looseItems)) {
            return res.status(400).json({ 
                message: '无效的装备类型。有效类型：' + VALID_EQUIPMENT_TYPES.join(', ') 
            });
        }
        
        await processAndSaveImages(newDungeon, newDungeon.dungeonId);

        // 双写模式：同时写入数据库和JSON
        console.log('🔄 POST /api/equipment/dungeons 被调用');
        console.log('地下城ID:', newDungeon.dungeonId);

        const writeResult = await DataSyncService.writeData('equipment', newDungeon);
        console.log('写入结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 装备地下城创建成功');
            res.status(201).json(newDungeon);
        } else {
            console.log('❌ 装备地下城创建失败');
            res.status(500).json({
                message: '装备地下城创建失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('创建装备地下城失败:', error);
        res.status(500).json({ error: '创建装备地下城失败', details: error.message });
    }
});

// API to update a dungeon
app.put('/api/equipment/dungeons/:dungeonId', requireAuth, async (req, res) => {
    try {
        const { dungeonId } = req.params;
        const updatedDungeon = req.body;
        const data = await readEquipmentData();
        
        const index = data.findIndex(d => d.dungeonId === dungeonId);
        if (index === -1) {
            return res.status(404).json({ message: `Dungeon with ID "${dungeonId}" not found.` });
        }

        // 验证装备类型
        const validateEquipmentType = (items) => {
            if (!Array.isArray(items)) return true;
            return items.every(item => VALID_EQUIPMENT_TYPES.includes(item.type));
        };

        // 验证套装装备类型
        if (updatedDungeon.equipmentSets) {
            for (const set of updatedDungeon.equipmentSets) {
                if (!validateEquipmentType(set.items)) {
                    return res.status(400).json({ 
                        message: '无效的装备类型。有效类型：' + VALID_EQUIPMENT_TYPES.join(', ') 
                    });
                }
            }
        }

        // 验证散件装备类型
        if (!validateEquipmentType(updatedDungeon.looseItems)) {
            return res.status(400).json({ 
                message: '无效的装备类型。有效类型：' + VALID_EQUIPMENT_TYPES.join(', ') 
            });
        }
        
        // Preserve the original ID
        updatedDungeon.dungeonId = dungeonId;
        
        await processAndSaveImages(updatedDungeon, dungeonId);

        // 双写模式：同时更新数据库和JSON
        console.log('🔄 PUT /api/equipment/dungeons/:dungeonId 被调用');
        console.log('地下城ID:', dungeonId);

        const writeResult = await DataSyncService.writeData('equipment', updatedDungeon, dungeonId);
        console.log('更新结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 装备地下城更新成功');
            res.json(updatedDungeon);
        } else {
            console.log('❌ 装备地下城更新失败');
            res.status(500).json({
                message: '装备地下城更新失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('更新装备地下城失败:', error);
        res.status(500).json({ error: '更新装备地下城失败', details: error.message });
    }
});

// API to delete a dungeon (支持双写模式)
app.delete('/api/equipment/dungeons/:dungeonId', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/equipment/dungeons/:dungeonId 被调用');
        console.log('要删除的地下城ID:', req.params.dungeonId);

        const { dungeonId } = req.params;

        // 检查地下城是否存在（从当前数据源）
        const existingEquipment = await DataSyncService.readData('equipment');
        const dungeonExists = Array.isArray(existingEquipment)
            ? existingEquipment.some(d => d.dungeonId === dungeonId)
            : false;

        if (!dungeonExists) {
            return res.status(404).json({ message: `Dungeon with ID "${dungeonId}" not found.` });
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('equipment', dungeonId);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 装备地下城删除成功');
            res.json({ message: 'Dungeon deleted successfully.' });
        } else {
            console.log('❌ 装备地下城删除失败');
            res.status(500).json({
                message: '装备地下城删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除装备地下城失败:', error);
        res.status(500).json({ error: '删除装备地下城失败', details: error.message });
    }
});

// 装备图片根目录
const EQUIPMENT_IMAGE_ROOT_DUMMY = path.join(__dirname, '..', 'frontend', 'js', 'data', 'guides', 'src', 'equipment');

// 确保装备图片目录存在
fs.ensureDirSync(EQUIPMENT_IMAGE_ROOT_DUMMY);

// 下载网络图片
async function downloadImage_dummy(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${res.statusCode}`));
        return;
      }

      const writeStream = fs.createWriteStream(filepath);
      res.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });

      writeStream.on('error', reject);
    }).on('error', reject);
  });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const { dungeonId } = req.query;

    if (!dungeonId) {
      cb(new Error('上传图片时必须提供副本ID (dunngeonId)'));
      return;
    }

    // 所有图片，无论是副本图标还是装备图标，都根据dungeonId保存到同一个地方
    const uploadDir = path.join(EQUIPMENT_IMAGE_ROOT_DUMMY, dungeonId);

    // 确保目录存在
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 使用简单的命名方式：原始文件名-时间戳
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    cb(null, `${basename}-${timestamp}${ext}`);
  }
});

const uploadMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制5MB
  },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('只允许上传图片文件！'));
    }
    cb(null, true);
  }
});

// 中间件
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// 图片上传API
app.post('/api/upload/equipment', requireAuth, uploadMiddleware.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有收到文件' });
    }
    
    // 返回相对路径（相对于前端根目录）
    const relativePath = path.relative(
      path.join(__dirname, '..', 'frontend'),
      req.file.path
    ).replace(/\\/g, '/');
    
    res.json({ url: `/${relativePath}` });
  } catch (error) {
    console.error('上传文件时出错:', error);
    res.status(500).json({ error: '上传文件失败' });
  }
});

// 保存网络图片API
app.post('/api/save/equipment/image', requireAuth, async (req, res) => {
  try {
    const { imageUrl, dungeonId, filename } = req.body;

    if (!imageUrl || !dungeonId || !filename) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // This reuses the logic from processImageField, but we can leave it for now
    const saveDir = path.join(EQUIPMENT_IMAGE_ROOT, dungeonId);
    fs.ensureDirSync(saveDir);
    const basename = path.basename(filename, path.extname(filename));
    const timestamp = Date.now();
    const finalFilename = `${basename}-${timestamp}${path.extname(filename) || '.png'}`;
    const relativePath = await downloadAndSaveImage(imageUrl, saveDir, `${basename}-${timestamp}`);

    res.json({ url: relativePath });
  } catch (error) {
    console.error('保存网络图片时出错:', error);
    res.status(500).json({ error: '保存网络图片失败' });
  }
});

// New unified uploader for Digimon and Evolution assets
const assetStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let { folderPath } = req.query;
    // Security: Clean up path from frontend to prevent duplication
    if (typeof folderPath === 'string' && folderPath.startsWith('js/data/')) {
        folderPath = folderPath.substring('js/data/'.length);
    }

    // Security: Basic check to prevent directory traversal.
    if (!folderPath || folderPath.includes('..') || !['details_digimons', 'guides/src/digimon', 'guides/src/equipment', 'guides/src/items'].some(p => folderPath.startsWith(p))) {
        return cb(new Error('Invalid or missing folderPath.'));
    }
    const targetDir = path.join(frontendPath, 'js', 'data', folderPath);
    fs.ensureDirSync(targetDir);
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    const basename = path.basename(file.originalname, path.extname(file.originalname));
    const timestamp = Date.now();
    cb(null, `${basename}-${timestamp}${path.extname(file.originalname)}`);
  }
});

const uploadAsset = multer({ storage: assetStorage });

app.post('/api/upload/digimon-asset', requireAuth, uploadAsset.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    const relativePath = `/${path.relative(frontendPath, req.file.path).replace(/\\/g, '/')}`;
    res.status(200).json({ url: relativePath });
});

// --- Changelog API ---

const readChangelogData = async () => {
    try {
        if (await fs.exists(changelogDataPath)) {
            return await fs.readJson(changelogDataPath);
        }
        return [];
    } catch (error) {
        console.error('Error reading changelog data:', error);
        return [];
    }
};

const writeChangelogData = async (data) => {
    const release = await fileMutexes.changelog.acquire();
    try {
        await fs.writeJson(changelogDataPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Error writing changelog data:', error);
        throw error;
    } finally {
        release();
    }
};

// GET all changelogs (支持双读模式)
app.get('/api/changelogs', async (req, res) => {
    try {
        console.log('🔄 GET /api/changelogs 被调用');

        // 使用DataSyncService读取数据（双读模式）
        const data = await DataSyncService.readData('changelog');
        console.log(`📖 读取到 ${Array.isArray(data) ? data.length : 0} 条日志记录`);

        res.json(data);
    } catch (error) {
        console.error('获取日志数据失败:', error);

        // 降级到JSON文件读取
        console.log('⚠️  降级到JSON文件读取');
        try {
            const data = await readChangelogData();
            res.json(data);
        } catch (fallbackError) {
            console.error('JSON文件读取也失败:', fallbackError);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

// POST a new changelog (支持双写模式)
app.post('/api/changelogs', requireAuth, async (req, res) => {
    try {
        console.log('🔄 POST /api/changelogs 被调用');
        console.log('请求数据:', JSON.stringify(req.body, null, 2));

        const newLog = req.body;

        if (!newLog.version || !newLog.date || !Array.isArray(newLog.changes)) {
            return res.status(400).json({ message: 'Version, date, and changes array are required.' });
        }

        // 检查版本是否已存在
        const existingChangelogs = await DataSyncService.readData('changelog');
        if (Array.isArray(existingChangelogs) && existingChangelogs.some(c => c.version === newLog.version)) {
            return res.status(400).json({ message: `Changelog with version "${newLog.version}" already exists.` });
        }

        // 双写模式：同时写入数据库和JSON
        const writeResult = await DataSyncService.writeData('changelog', newLog);
        console.log('写入结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 日志创建成功');
            res.status(201).json(newLog);
        } else {
            console.log('❌ 日志创建失败');
            res.status(500).json({
                message: '日志创建失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('创建日志失败:', error);
        res.status(500).json({ error: '创建日志失败', details: error.message });
    }
});

// PUT (update) a changelog (支持双写模式)
app.put('/api/changelogs/:version', requireAuth, async (req, res) => {
    try {
        console.log('🔄 PUT /api/changelogs/:version 被调用');
        console.log('版本:', req.params.version);
        console.log('更新数据:', JSON.stringify(req.body, null, 2));

        const { version } = req.params;
        const updatedLogData = req.body;

        // 检查日志是否存在
        const existingChangelogs = await DataSyncService.readData('changelog');
        const existingLog = Array.isArray(existingChangelogs)
            ? existingChangelogs.find(c => c.version === version)
            : null;

        if (!existingLog) {
            return res.status(404).json({ message: 'Changelog not found.' });
        }

        // 检查版本冲突
        const originalVersion = req.params.version;
        const newVersion = updatedLogData.version || originalVersion;

        if (originalVersion !== newVersion && existingChangelogs.some(c => c.version === newVersion)) {
            return res.status(400).json({
                message: `Cannot update version to "${newVersion}" as it already exists.`
            });
        }

        // 合并更新数据
        const finalLogData = { ...existingLog, ...updatedLogData };

        // 双写模式：同时更新数据库和JSON
        const writeResult = await DataSyncService.writeData('changelog', finalLogData, version);
        console.log('更新结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 日志更新成功');
            res.json(finalLogData);
        } else {
            console.log('❌ 日志更新失败');
            res.status(500).json({
                message: '日志更新失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('更新日志失败:', error);
        res.status(500).json({ error: '更新日志失败', details: error.message });
    }
});

// DELETE a changelog (支持双写模式)
app.delete('/api/changelogs/:version', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/changelogs/:version 被调用');
        console.log('要删除的版本:', req.params.version);

        const { version } = req.params;

        // 检查日志是否存在
        const existingChangelogs = await DataSyncService.readData('changelog');
        const existingLog = Array.isArray(existingChangelogs)
            ? existingChangelogs.find(c => c.version === version)
            : null;

        if (!existingLog) {
            return res.status(404).json({ message: 'Changelog not found.' });
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('changelog', version);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 日志删除成功');
            res.status(200).json({ message: 'Changelog deleted successfully.' });
        } else {
            console.log('❌ 日志删除失败');
            res.status(500).json({
                message: '日志删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除日志失败:', error);
        res.status(500).json({ error: '删除日志失败', details: error.message });
    }
});

// --- Items API (Refactored) ---
const readItemsData = async () => {
    try {
        const data = await fsp.readFile(itemsDataPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return []; // Return empty array if file doesn't exist
        console.error('Error reading items data:', error);
        throw error;
    }
};

const writeItemsData = async (data) => {
    const release = await fileMutexes.items.acquire();
    try {
        await fsp.writeFile(itemsDataPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing items data:', error);
        throw error;
    } finally {
        release();
    }
};

// GET all items (支持双读模式)
app.get('/api/items', async (req, res) => {
    try {
        console.log('🔄 GET /api/items 被调用');

        // 使用DataSyncService读取数据（双读模式）
        const items = await DataSyncService.readData('items');
        console.log(`📖 读取到 ${Array.isArray(items) ? items.length : 0} 条物品记录`);

        res.json(items);
    } catch (error) {
        console.error('获取物品数据失败:', error);

        // 降级到JSON文件读取
        console.log('⚠️  降级到JSON文件读取');
        try {
            const items = await readItemsData();
            res.json(items);
        } catch (fallbackError) {
            console.error('JSON文件读取也失败:', fallbackError);
            res.status(500).json({ message: 'Failed to fetch items.' });
        }
    }
});

// GET a single item by ID
app.get('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const items = await readItemsData();
        const item = items.find(i => i.id === id);
        if (!item) {
            return res.status(404).json({ message: `Item with ID "${id}" not found.` });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch item data.' });
    }
});

// POST a new item (支持双写模式)
app.post('/api/items', requireAuth, async (req, res) => {
    try {
        console.log('🔄 POST /api/items 被调用');
        console.log('请求数据:', JSON.stringify(req.body, null, 2));

        const newItem = req.body;
        if (!newItem.id || !newItem.name) {
            return res.status(400).json({ message: 'Item ID and name are required.' });
        }

        // 检查物品是否已存在
        const existingItems = await DataSyncService.readData('items');
        if (Array.isArray(existingItems) && existingItems.some(i => i.id === newItem.id)) {
            return res.status(409).json({ message: `Item with ID "${newItem.id}" already exists.` });
        }

        // 双写模式：同时写入数据库和JSON
        const writeResult = await DataSyncService.writeData('items', newItem);
        console.log('写入结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 物品创建成功');
            res.status(201).json(newItem);
        } else {
            console.log('❌ 物品创建失败');
            res.status(500).json({
                message: '物品创建失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('创建物品失败:', error);
        res.status(500).json({ error: '创建物品失败', details: error.message });
    }
});

// PUT (update) an item by ID (支持双写模式)
app.put('/api/items/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 PUT /api/items/:id 被调用');
        console.log('物品ID:', req.params.id);
        console.log('更新数据:', JSON.stringify(req.body, null, 2));

        const { id } = req.params;
        const updatedItemData = req.body;

        // 检查物品是否存在
        const existingItems = await DataSyncService.readData('items');
        const existingItem = Array.isArray(existingItems)
            ? existingItems.find(i => i.id === id)
            : null;

        if (!existingItem) {
            return res.status(404).json({ message: `Item with ID "${id}" not found.` });
        }

        // 合并更新数据
        const finalItemData = { ...existingItem, ...updatedItemData };

        // 双写模式：同时更新数据库和JSON
        const writeResult = await DataSyncService.writeData('items', finalItemData, id);
        console.log('更新结果:', writeResult);

        if (writeResult.success) {
            console.log('✅ 物品更新成功');
            res.json(finalItemData);
        } else {
            console.log('❌ 物品更新失败');
            res.status(500).json({
                message: '物品更新失败',
                details: writeResult
            });
        }
    } catch (error) {
        console.error('更新物品失败:', error);
        res.status(500).json({ error: '更新物品失败', details: error.message });
    }
});

// API to delete an Item (支持双写模式)
app.delete('/api/items/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/items/:id 被调用');
        console.log('要删除的ID:', req.params.id);

        const { id } = req.params;

        // 检查物品是否存在（从当前数据源）
        const existingItems = await DataSyncService.readData('items');
        const itemToDelete = Array.isArray(existingItems)
            ? existingItems.find(item => item.id === id)
            : null;

        if (!itemToDelete) {
            return res.status(404).json({ message: `Item with ID "${id}" not found.` });
        }

        // 删除关联的图片文件
        if (itemToDelete.image) {
            try {
                const imagePath = path.join(__dirname, '..', 'frontend', itemToDelete.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`Deleted associated image: ${imagePath}`);
                }
            } catch (e) {
                console.error(`Could not delete image for item ${id} at path ${itemToDelete.image}:`, e.message);
            }
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('items', id);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 物品删除成功');
            res.status(204).send();
        } else {
            console.log('❌ 物品删除失败');
            res.status(500).json({
                message: '物品删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除物品失败:', error);
        res.status(500).json({ error: '删除物品失败', details: error.message });
    }
});

// POST (upload) an item image
app.post('/api/upload/item', requireAuth, uploadItemImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image file uploaded.' });
    }
    const category = req.query.category;
    const relativePath = `/js/data/guides/src/items/${category}/${req.file.filename}`;
    res.status(200).json({ url: relativePath });
});

// --- Synthesis API & Helpers (Corrected Placement) ---

const readSynthesisData = async () => {
    try {
        if (await fs.pathExists(synthesisDataPath)) {
            return await fs.readJson(synthesisDataPath);
        }
        return [];
    } catch (error) {
        console.error('Error reading synthesis data:', error);
        return [];
    }
};

const writeSynthesisData = async (data) => {
    const release = await fileMutexes.synthesis.acquire();
    try {
        await fs.writeJson(synthesisDataPath, data, { spaces: 2 });
    } catch (error) {
        console.error('Error writing synthesis data:', error);
        throw error;
    } finally {
        release();
    }
};

const getAllEquipmentItemNames = async () => {
    const dungeons = await readEquipmentData();
    const itemNames = new Set();
    dungeons.forEach(dungeon => {
        dungeon.equipmentSets?.forEach(set => {
            set.items?.forEach(item => {
                if (item.name) itemNames.add(item.name);
            });
        });
        dungeon.looseItems?.forEach(item => {
            if (item.name) itemNames.add(item.name);
        });
    });
    return Array.from(itemNames).sort();
};

app.get('/api/equipment/all-item-names', requireAuth, async (req, res) => {
    try {
        const names = await getAllEquipmentItemNames();
        res.json(names);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get equipment item names' });
    }
});

app.get('/api/synthesis', async (req, res) => {
    try {
        console.log('🔄 GET /api/synthesis 被调用');

        // 使用DataSyncService读取数据（双读模式）
        const recipes = await DataSyncService.readData('synthesis');
        console.log(`📖 读取到 ${Array.isArray(recipes) ? recipes.length : 0} 条合成配方`);

        const allItems = await getAllCraftableItems();
        
        const itemMap = new Map(allItems.map(item => [item.id, item.name]));

        const populatedRecipes = recipes.map(recipe => {
            // Add a safety check to ensure recipe.materials is an array
            const materials = (Array.isArray(recipe.materials) ? recipe.materials : []).map(material => ({
                ...material,
                itemName: itemMap.get(material.materialId) || '未知物品'
            }));

            return {
                ...recipe,
                targetItemName: itemMap.get(recipe.targetItemId) || '未知装备',
                materials
            };
        });

        res.json(populatedRecipes);
    } catch (error) {
        console.error('获取合成配方数据失败:', error);

        // 降级到JSON文件读取
        console.log('⚠️  降级到JSON文件读取');
        try {
            const recipes = await readSynthesisData();
            const allItems = await getAllCraftableItems();

            const itemMap = new Map(allItems.map(item => [item.id, item.name]));

            const populatedRecipes = recipes.map(recipe => {
                const materials = (Array.isArray(recipe.materials) ? recipe.materials : []).map(material => ({
                    ...material,
                    itemName: itemMap.get(material.materialId) || '未知物品'
                }));

                return {
                    ...recipe,
                    targetItemName: itemMap.get(recipe.targetItemId) || '未知装备',
                    materials
                };
            });

            res.json(populatedRecipes);
        } catch (fallbackError) {
            console.error('JSON文件读取也失败:', fallbackError);
            res.status(500).json({ message: 'Failed to retrieve synthesis recipes.' });
        }
    }
});

app.post('/api/synthesis', requireAuth, async (req, res) => {
    const recipes = await readSynthesisData();
    const newRecipe = req.body;
    
    if (!newRecipe.targetItemId || !newRecipe.materials || newRecipe.materials.length === 0) {
        return res.status(400).json({ message: 'Target item and at least one material are required.' });
    }

    // Generate a new ID for the recipe
    newRecipe.id = `syn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 双写模式：同时写入数据库和JSON
    console.log('🔄 POST /api/synthesis 被调用');
    console.log('合成配方ID:', newRecipe.id);
    console.log('处理后的数据:', JSON.stringify(newRecipe, null, 2));

    const writeResult = await DataSyncService.writeData('synthesis', newRecipe);
    console.log('写入结果:', writeResult);

    if (writeResult.success) {
        console.log('✅ 合成配方创建成功');
        res.status(201).json(newRecipe);
    } else {
        console.log('❌ 合成配方创建失败');
        res.status(500).json({
            message: '合成配方创建失败',
            details: writeResult
        });
    }
});

app.put('/api/synthesis/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const updatedRecipe = req.body;
    const recipes = await readSynthesisData();

    const recipeIndex = recipes.findIndex(item => item.id === id);

    if (recipeIndex === -1) {
        return res.status(404).json({ message: `Synthesis item with ID "${id}" not found.` });
    }

    const updatedRecipeData = { ...req.body, id: id };

    if (!updatedRecipeData.targetItemId || !updatedRecipeData.materials || updatedRecipeData.materials.length === 0) {
        return res.status(400).json({ message: 'Target item and at least one material are required.' });
    }

    // 双写模式：同时更新数据库和JSON
    console.log('🔄 PUT /api/synthesis/:id 被调用');
    console.log('合成配方ID:', id);
    console.log('处理后的数据:', JSON.stringify(updatedRecipeData, null, 2));

    const writeResult = await DataSyncService.writeData('synthesis', updatedRecipeData, id);
    console.log('更新结果:', writeResult);

    if (writeResult.success) {
        console.log('✅ 合成配方更新成功');
        res.status(200).json(updatedRecipeData);
    } else {
        console.log('❌ 合成配方更新失败');
        res.status(500).json({
            message: '合成配方更新失败',
            details: writeResult
        });
    }
});

// API to delete a Synthesis Recipe (支持双写模式)
app.delete('/api/synthesis/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔄 DELETE /api/synthesis/:id 被调用');
        console.log('要删除的ID:', req.params.id);

        const { id } = req.params;

        // 检查合成配方是否存在（从当前数据源）
        const existingRecipes = await DataSyncService.readData('synthesis');
        const recipeExists = Array.isArray(existingRecipes)
            ? existingRecipes.some(recipe => recipe.id === id)
            : false;

        if (!recipeExists) {
            return res.status(404).json({ message: `Synthesis item with ID "${id}" not found.` });
        }

        // 双写模式：同时从数据库和JSON删除
        const deleteResult = await DataSyncService.deleteData('synthesis', id);
        console.log('删除结果:', deleteResult);

        if (deleteResult.success) {
            console.log('✅ 合成配方删除成功');
            res.status(200).json({ message: 'Synthesis item deleted successfully.' });
        } else {
            console.log('❌ 合成配方删除失败');
            res.status(500).json({
                message: '合成配方删除失败',
                details: deleteResult
            });
        }
    } catch (error) {
        console.error('删除合成配方失败:', error);
        res.status(500).json({ error: '删除合成配方失败', details: error.message });
    }
});

// --- NEW Endpoint to get all items for synthesis editor ---
app.get('/api/all-craftable-items', async (req, res) => {
    try {
        const items = await getAllCraftableItems();
        res.json(items);
    } catch (error) {
        console.error('Error fetching craftable items:', error);
        res.status(500).json({ message: 'Failed to fetch craftable items' });
    }
});

/**
 * NEW HELPER: Reads all items and equipment and returns a unified list.
 * This abstracts the logic used by multiple endpoints.
 * @returns {Promise<Array<{id: string, name: string, image: string, type: string}>>}
 */
const getAllCraftableItems = async () => {
    const allItems = [];

    // 1. Read materials from items.json
    const materials = await readItemsData();
    if (materials && Array.isArray(materials)) {
        materials.forEach(item => {
            if (item.id && item.name) {
                allItems.push({
                    id: item.id,
                    name: item.name,
                    image: ensureAbsoluteUrl(item.image),
                    type: item.category || 'material', // Use category, fallback to material
                    description: item.description,
                    acquisitionMethod: item.acquisitionMethod || item.acquisition_method
                });
            }
        });
    }

    // 2. Read equipment from equipment.json
    const equipmentData = await readEquipmentData();
    if (equipmentData && Array.isArray(equipmentData)) {
        equipmentData.forEach(dungeon => {
            const processEquipmentItem = (item) => {
                if (item.id && item.name) {
                    allItems.push({
                        id: item.id,
                        name: item.name,
                        image: ensureAbsoluteUrl(item.icon),
                        type: 'equipment',
                        description: item.description,
                        acquisitionMethod: item.acquisitionMethod,
                        attributes: item.attributes
                    });
                }
            };
            dungeon.looseItems?.forEach(processEquipmentItem);
            dungeon.equipmentSets?.forEach(set => {
                set.items?.forEach(processEquipmentItem);
            });
        });
    }
    
    // Sort by name for user-friendly display, though the primary use is a map.
    allItems.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return allItems;
};

// === 数据库管理API ===

// 检查数据库状态
app.get('/api/admin/database/status', requireAuth, async (req, res) => {
    try {
        const dbConnected = await testConnection();
        const config = {
            USE_DATABASE: process.env.USE_DATABASE === 'true',
            FALLBACK_TO_JSON: process.env.FALLBACK_TO_JSON !== 'false',
            DUAL_WRITE: process.env.DUAL_WRITE !== 'false'
        };

        res.json({
            database_connected: dbConnected,
            config: config,
            status: dbConnected ? 'healthy' : 'disconnected'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 数据同步：数据库 -> JSON
app.post('/api/admin/database/sync-to-json', requireAuth, async (req, res) => {
    try {
        const results = await DataSyncService.syncDatabaseToJSON();
        res.json({
            message: '数据同步完成',
            results: results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 数据一致性验证
app.get('/api/admin/database/validate', requireAuth, async (req, res) => {
    try {
        const results = await DataSyncService.validateDataConsistency();
        res.json({
            message: '数据一致性检查完成',
            results: results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 切换数据库模式
app.post('/api/admin/database/toggle-mode', requireAuth, async (req, res) => {
    try {
        const { useDatabase } = req.body;
        process.env.USE_DATABASE = useDatabase ? 'true' : 'false';

        res.json({
            message: '数据库模式已切换',
            current_mode: process.env.USE_DATABASE === 'true' ? 'database' : 'json'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
async function startServer() {
    try {
        // 测试数据库连接
        console.log('🔗 测试数据库连接...');
        const dbConnected = await testConnection();

        if (dbConnected) {
            console.log('✅ 数据库连接成功，启用双写模式');
            process.env.USE_DATABASE = 'true';
        } else {
            console.log('⚠️  数据库连接失败，使用纯JSON模式');
            process.env.USE_DATABASE = 'false';
        }

        // 启动HTTP服务器
        app.listen(port, () => {
            console.log(`🚀 服务器运行在 http://localhost:${port}`);
            console.log(`📊 数据库模式: ${process.env.USE_DATABASE === 'true' ? '启用' : '禁用'}`);
        });

    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();