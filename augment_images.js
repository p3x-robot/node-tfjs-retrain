const minimist = require("minimist");
const cv = require("opencv4nodejs");
const fg = require("fast-glob");
const fse = require("fs-extra");
const path = require("path");

let args = minimist(process.argv.slice(2), {
    string: ["images_dir", "labels_to_skip"],
    boolean: true,
    default: {
        flip_images: false
    }
});

if (!args.images_dir) {
    throw new Error("--images_dir not specified.");
}

run().then(_ => {
    console.log("Run Complete");
});

async function run() {
    let images = await readImagesDirectory(args.images_dir);
    let labels_to_skip = (args.labels_to_skip || "")
        .split(";")
        .map(item => item.toLowerCase());

    console.time("Flipping");
    for (const item of images) {
        if (!labels_to_skip.includes(item.label.toLowerCase())) {
            if (args.flip_images) {
                const newNames = await augment_flip(item.images, true, true);
            }
        }
    }
    console.timeEnd("Flipping");
}

async function augment_flip(fileNames, flip_x, flip_y) {
    let names = [];

    for (const item of fileNames) {
        const image = await cv.imreadAsync(item);
        const parsed = path.parse(item);
        const baseDir = path.join(parsed.dir, "flipped");
        const baseName = path.join(baseDir, parsed.name);

        let writePromises = [];
        if (flip_x || flip_y) await fse.ensureDir(baseDir);

        if (flip_x) {
            names.push(baseName + "_m_x" + parsed.ext);
            writePromises.push(flipAndWrite(image, 1, names[names.length - 1]));
        }
        if (flip_y) {
            names.push(baseName + "_m_y" + parsed.ext);
            writePromises.push(flipAndWrite(image, 0, names[names.length - 1]));
        }
        if (flip_x && flip_y) {
            names.push(baseName + "_m_xy" + parsed.ext);
            writePromises.push(
                flipAndWrite(image, -1, names[names.length - 1])
            );
        }

        await Promise.all(writePromises);
    }

    return names;
}

async function flipAndWrite(image, flipCode, name) {
    await cv.imwriteAsync(name, await image.flipAsync(flipCode));
}

async function getDirectories(imagesDirectory) {
    return await fse.readdir(imagesDirectory);
}

async function getImagesInDirectory(directory) {
    return await fg(path.join(directory, "*.jpg"));
}

async function readImagesDirectory(imagesDirectory) {
    const directories = await getDirectories(imagesDirectory);
    const result = await Promise.all(
        directories.map(async directory => {
            const p = path.join(imagesDirectory, directory);
            return getImagesInDirectory(p).then(images => {
                return { label: directory, images: images };
            });
        })
    );

    return result;
}