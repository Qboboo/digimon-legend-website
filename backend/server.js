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

// API to get all Digimon
app.get('/api/digimons', async (req, res) => {
    const data = await readDigimonData();
    res.json(data);
});

// API to create a new Digimon
app.post('/api/digimons', requireAuth, async (req, res) => {
    const digimons = await readDigimonData();
    const newDigimon = req.body;

    if (!newDigimon.id || !newDigimon.name) {
        return res.status(400).json({ message: 'ID and Name are required.' });
    }
    if (digimons.some(d => d.id === newDigimon.id)) {
        return res.status(400).json({ message: `Digimon with ID "${newDigimon.id}" already exists.` });
    }

    // Process image: download if it's a URL, otherwise ensure absolute path
    newDigimon.image = await processImageField(newDigimon.image, DIGIMON_DETAILS_ROOT, newDigimon.id);

    digimons.push(newDigimon);
    await writeDigimonData(digimons);
    res.status(201).json(newDigimon);
});

// API to update a Digimon
app.put('/api/digimons/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const updatedDigimonData = req.body;
    const digimons = await readDigimonData();

    const index = digimons.findIndex(d => d.id === id);
    if (index === -1) {
        return res.status(404).json({ message: 'Digimon not found.' });
    }

    // Process image: download if it's a URL, otherwise ensure absolute path
    updatedDigimonData.image = await processImageField(updatedDigimonData.image, DIGIMON_DETAILS_ROOT, id);

    digimons[index] = { ...digimons[index], ...updatedDigimonData };
    await writeDigimonData(digimons);
    res.json(digimons[index]);
});

// API to delete a Digimon
app.delete('/api/digimons/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    let digimons = await readDigimonData();
    
    const initialLength = digimons.length;
    digimons = digimons.filter(d => d.id !== id);

    if (digimons.length === initialLength) {
        return res.status(404).json({ message: 'Digimon not found.' });
    }

    await writeDigimonData(digimons);
    res.status(200).json({ message: 'Digimon deleted successfully.' });
});

// API to get all Evolutions
app.get('/api/evolutions', async (req, res) => {
    const data = await readEvolutionsData();
    res.json(data);
});

// API to create a new Evolution
app.post('/api/evolutions', requireAuth, async (req, res) => {
    const { id, data } = req.body;
    const evolutions = await readEvolutionsData();

    if (!id || !data) {
        return res.status(400).json({ message: 'Evolution ID and data are required.' });
    }
    if (evolutions[id]) {
        return res.status(400).json({ message: `Evolution with ID "${id}" already exists.` });
    }

    await processEvolutionImages(data, id);

    evolutions[id] = data;
    await writeEvolutionsData(evolutions);
    res.status(201).json(data);
});

// API to update an Evolution
app.put('/api/evolutions/:id', requireAuth, async (req, res) => {
    const originalId = req.params.id;
    const { id: newId, data: updatedData } = req.body;
    const evolutions = await readEvolutionsData();

    if (!evolutions[originalId]) {
        return res.status(404).json({ message: `Evolution with ID "${originalId}" not found.` });
    }

    // If the ID has been changed, remove the old entry
    if (originalId !== newId) {
        // Check if the new ID would conflict with an existing evolution
        if (evolutions[newId]) {
            return res.status(400).json({ message: `Cannot rename to "${newId}" as it already exists.` });
        }
        delete evolutions[originalId];
    }
    
    await processEvolutionImages(updatedData, newId);
    
    evolutions[newId] = updatedData;
    await writeEvolutionsData(evolutions);
    res.json(updatedData);
});

// API to delete an Evolution
app.delete('/api/evolutions/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const evolutions = await readEvolutionsData();

    if (!evolutions[id]) {
        return res.status(404).json({ message: `Evolution with ID "${id}" not found.` });
    }

    delete evolutions[id];
    await writeEvolutionsData(evolutions);
    res.status(200).json({ message: 'Evolution deleted successfully.' });
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
        let allGuides = [];
        for (const category of guideCategories) {
            const filePath = path.join(guidesDirectory, `${category}.json`);
            if (!fs.existsSync(filePath)) {
                console.warn(`[Server Warning] File not found: ${filePath}. Skipping.`);
                continue;
            }

            const fileContent = await fs.readJson(filePath);
            
            // Handle both formats: direct array `[]` or object with a guides key `{ "guides": [] }`
            let guidesInCategory = [];
            if (Array.isArray(fileContent)) {
                guidesInCategory = fileContent;
            } else if (fileContent && Array.isArray(fileContent.guides)) {
                guidesInCategory = fileContent.guides;
            } else {
                console.warn(`[Server Warning] Data in ${filePath} is not a valid guide array or object. Skipping.`);
                continue;
            }
            
            const guidesWithDefaults = guidesInCategory.map(g => ({
                ...g,
                category: g.category || category, // Ensure category is set
                contentType: g.contentType || 'html',
                status: g.status || 'published'
            }));
            allGuides = allGuides.concat(guidesWithDefaults);
        }
        return allGuides;
    } catch (error) {
        console.error('Error reading guides:', error);
        return [];
    }
};

// Helper to write guides back
const writeGuides = async (guides) => {
    const release = await fileMutexes.guides.acquire();
    try {
        for (const category of guideCategories) {
            const categoryGuides = guides.filter(g => g.category === category);
            const filePath = path.join(guidesDirectory, `${category}.json`);
            await fs.writeJson(filePath, categoryGuides, { spaces: 2 });
        }
    } catch (error) {
        console.error('Error writing guides:', error);
        throw error;
    } finally {
        release();
    }
};

// GET /api/guides (for public)
app.get('/api/guides', async (req, res) => {
    const guides = await readAllGuides();
    res.json(guides.filter(g => g.status === 'published'));
});

// GET /api/admin/guides (for admin panel)
app.get('/api/admin/guides', requireAuth, async (req, res) => {
    const guides = await readAllGuides();
    res.json(guides);
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

    allGuides.push(newGuide);
    await writeGuides(allGuides);
    res.status(201).json(newGuide);
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
    allGuides[guideIndex] = finalGuide;
    
    await writeGuides(allGuides);
    res.json(finalGuide);
});

// DELETE /api/guides/:slug (soft delete)
app.delete('/api/guides/:slug', requireAuth, async (req, res) => {
    const { slug } = req.params;
    let allGuides = await readAllGuides();
    const guideIndex = allGuides.findIndex(g => g.slug === slug);

    if (guideIndex === -1) {
        return res.status(404).json({ message: 'Guide not found' });
    }

    // Instead of deleting, we change its status to 'trashed'
    allGuides[guideIndex].status = 'trashed';

    await writeGuides(allGuides);
    res.status(200).json({ message: 'Guide moved to trash' });
});

// PUT /api/guides/:slug/restore (to restore from trash)
app.put('/api/guides/:slug/restore', requireAuth, async (req, res) => {
    const { slug } = req.params;
    let allGuides = await readAllGuides();
    const guideIndex = allGuides.findIndex(g => g.slug === slug && g.status === 'trashed');

    if (guideIndex === -1) {
        return res.status(404).json({ message: 'Trashed guide not found' });
    }

    allGuides[guideIndex].status = 'draft'; // Restore to draft status

    await writeGuides(allGuides);
    res.status(200).json({ message: 'Guide restored successfully' });
});

// DELETE /api/guides/:slug/permanent (to permanently delete)
app.delete('/api/guides/:slug/permanent', requireAuth, async (req, res) => {
    const { slug } = req.params;
    let allGuides = await readAllGuides();
    const guideIndex = allGuides.findIndex(g => g.slug === slug);

    if (guideIndex === -1) {
        return res.status(404).json({ message: 'Guide not found' });
    }
    
    // Physical deletion of associated image folder
    const guideToDelete = allGuides[guideIndex];
    const imageDir = path.join(finalGuidesUploadsDir, guideToDelete.category, guideToDelete.slug);
    if (fs.existsSync(imageDir)) {
        await fs.remove(imageDir);
        console.log(`Permanently deleted image folder: ${imageDir}`);
    }

    allGuides.splice(guideIndex, 1);

    await writeGuides(allGuides);
    res.status(200).json({ message: 'Guide permanently deleted' });
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

// API to get all Equipment
app.get('/api/equipment', async (req, res) => {
    try {
        const data = await readEquipmentData();
        res.json(data);
    } catch (error) {
        console.error('Error getting equipment data:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        data.push(newDungeon);
        await writeEquipmentData(data);
        res.status(201).json(newDungeon);
    } catch (error) {
        console.error('Error creating dungeon:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        data[index] = updatedDungeon;
        
        await writeEquipmentData(data);
        res.json(updatedDungeon);
    } catch (error) {
        console.error('Error updating dungeon:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// API to delete a dungeon
app.delete('/api/equipment/dungeons/:dungeonId', requireAuth, async (req, res) => {
    try {
        const { dungeonId } = req.params;
        let data = await readEquipmentData();
        
        const initialLength = data.length;
        data = data.filter(d => d.dungeonId !== dungeonId);
        
        if (data.length === initialLength) {
            return res.status(404).json({ message: `Dungeon with ID "${dungeonId}" not found.` });
        }
        
        await writeEquipmentData(data);
        res.json({ message: 'Dungeon deleted successfully.' });
    } catch (error) {
        console.error('Error deleting dungeon:', error);
        res.status(500).json({ message: 'Internal server error' });
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

// GET all changelogs
app.get('/api/changelogs', async (req, res) => {
    const data = await readChangelogData();
    res.json(data);
});

// POST a new changelog
app.post('/api/changelogs', requireAuth, async (req, res) => {
    const changelogs = await readChangelogData();
    const newLog = req.body;

    if (!newLog.version || !newLog.date || !Array.isArray(newLog.changes)) {
        return res.status(400).json({ message: 'Version, date, and changes array are required.' });
    }
    if (changelogs.some(c => c.version === newLog.version)) {
        return res.status(400).json({ message: `Changelog with version "${newLog.version}" already exists.` });
    }

    changelogs.unshift(newLog); // Add to the beginning
    await writeChangelogData(changelogs);
    res.status(201).json(newLog);
});

// PUT (update) a changelog
app.put('/api/changelogs/:version', requireAuth, async (req, res) => {
    const {
        version
    } = req.params;
    const updatedLogData = req.body;
    const changelogs = await readChangelogData();

    const index = changelogs.findIndex(c => c.version === version);
    if (index === -1) {
        return res.status(404).json({
            message: 'Changelog not found.'
        });
    }

    // The version can be edited now, so we remove the old entry and add a new one if version changes
    const originalVersion = req.params.version;
    const newVersion = updatedLogData.version || originalVersion;

    if (originalVersion !== newVersion && changelogs.some(c => c.version === newVersion)) {
        return res.status(400).json({
            message: `Cannot update version to "${newVersion}" as it already exists.`
        });
    }

    changelogs[index] = { ...changelogs[index],
        ...updatedLogData
    };

    // Sort logs by date after update
    changelogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    await writeChangelogData(changelogs);
    res.json(changelogs.find(c => c.version === newVersion));
});

// DELETE a changelog
app.delete('/api/changelogs/:version', requireAuth, async (req, res) => {
    const {
        version
    } = req.params;
    let changelogs = await readChangelogData();

    const initialLength = changelogs.length;
    changelogs = changelogs.filter(c => c.version !== version);

    if (changelogs.length === initialLength) {
        return res.status(404).json({
            message: 'Changelog not found.'
        });
    }

    await writeChangelogData(changelogs);
    res.status(200).json({
        message: 'Changelog deleted successfully.'
    });
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

// GET all items
app.get('/api/items', async (req, res) => {
    try {
        const items = await readItemsData();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch items.' });
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

// POST a new item
app.post('/api/items', requireAuth, async (req, res) => {
    try {
        const newItem = req.body;
        if (!newItem.id || !newItem.name) {
            return res.status(400).json({ message: 'Item ID and name are required.' });
        }
        let items = await readItemsData();
        if (items.some(i => i.id === newItem.id)) {
            return res.status(409).json({ message: `Item with ID "${newItem.id}" already exists.` });
        }
        items.push(newItem);
        await writeItemsData(items);
        res.status(201).json(newItem);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create new item.' });
    }
});

// PUT (update) an item by ID
app.put('/api/items/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const updatedItemData = req.body;
    try {
        let items = await readItemsData();
        const itemIndex = items.findIndex(i => i.id === id);
        if (itemIndex === -1) {
            return res.status(404).json({ message: `Item with ID "${id}" not found.` });
        }
        items[itemIndex] = { ...items[itemIndex], ...updatedItemData };
        await writeItemsData(items);
        res.json(items[itemIndex]);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update item.' });
    }
});

app.delete('/api/items/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
    let items = await readItemsData();
        const itemIndex = items.findIndex(item => item.id === id);

        if (itemIndex === -1) {
        return res.status(404).json({ message: `Item with ID "${id}" not found.` });
    }

        const itemToDelete = items[itemIndex];
        if (itemToDelete.image) {
            try {
                // image url is like '/js/data/...' so we need to construct path from project root
                const imagePath = path.join(__dirname, '..', 'frontend', itemToDelete.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`Deleted associated image: ${imagePath}`);
                }
            } catch (e) {
                console.error(`Could not delete image for item ${id} at path ${itemToDelete.image}:`, e.message);
            }
        }
        
        items.splice(itemIndex, 1);
    await writeItemsData(items);
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting item ${id}:`, error);
        res.status(500).json({ message: 'Failed to delete item due to a server error.' });
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
        const recipes = await readSynthesisData();
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
        console.error('Error fetching populated synthesis data:', error);
        res.status(500).json({ message: 'Failed to retrieve synthesis recipes.' });
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

    recipes.push(newRecipe);
    await writeSynthesisData(recipes);
    res.status(201).json(newRecipe);
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

    recipes[recipeIndex] = updatedRecipeData;
    await writeSynthesisData(recipes);
    res.status(200).json(updatedRecipeData);
});

app.delete('/api/synthesis/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    let recipes = await readSynthesisData();
    const initialLength = recipes.length;

    recipes = recipes.filter(item => item.id !== id);

    if (recipes.length === initialLength) {
        return res.status(404).json({ message: `Synthesis item with ID "${id}" not found.` });
    }

    await writeSynthesisData(recipes);
    res.status(200).json({ message: 'Synthesis item deleted successfully.' });
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

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}); 