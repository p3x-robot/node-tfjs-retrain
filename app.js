// @ts-check
const tf = require("@tensorflow/tfjs");
require("@tensorflow/tfjs-node");
global.fetch = require("node-fetch");
const fse = require("fs-extra");

const minimist = require("minimist");
const model = require("./model");
const data = require("./data");
const ui = require("./ui_mock");

const Model = new model();

let args = minimist(process.argv.slice(2), {
    string: ["images_dir", "model_dir"],
    boolean: true,
    default: {
        skip_training: false,
        batch_size_fraction: 0.4,
        dense_units: 100,
        epochs: 50,
        learning_rate: 0.0001
    }
});

if (!args.images_dir) {
    throw new Error("--images_dir not specified.");
}

if (!args.model_dir) {
    throw new Error("--model_dir not specified.");
}

async function init() {
    await data.loadLabelsAndImages(args.images_dir);

    console.time("Loading Model");
    await Model.init();
    console.timeEnd("Loading Model");
}

async function testModel() {
    console.log("Testing Model");
    await Model.loadModel(args.model_dir);

    if (Model.model) {
        console.time("Testing Predictions");
        console.log(Model.model.summary());

        let totalMislabeled = 0;
        let mislabeled = [];
        let imageIndex = 0;
        data.labelsAndImages.forEach(item => {
            let results = [];
            item.images.forEach(img_filename => {
                tf.tidy(() => {
                    let embeddings = data.dataset
                        ? data.getEmbeddingsForImage(imageIndex++)
                        : data.fileToTensor(img_filename);

                    let prediction = Model.getPrediction(embeddings);
                    results.push({
                        filename: img_filename,
                        results: prediction
                        /*
                        class: prediction.label,
                        probability: (
                            Number(prediction.confidence) * 100
                        ).toFixed(1)
                        */
                    });
                    /*
                    if (prediction.label !== item.label) {
                        mislabeled.push({
                            class: item.label,
                            prediction: prediction.label,
                            filename: img_filename
                        });
                        totalMislabeled++;
                    }
                    */
                });
            });
            console.log('==================================================')
            console.log(item.label.toUpperCase())
            for(let result of results) {
                console.log(result.filename)
                for(let prediction of result.results) {
                    console.log(`---> ${prediction.label} = ${Number(prediction.confidence * 100).toFixed(4)}`)
                }
                console.log('-------------------------------------------------')
            }
        });
        console.timeEnd("Testing Predictions");
        console.log(mislabeled);
        const totalImages = data.labelsAndImages
            .map(item => item.images.length)
            .reduce((p, c) => p + c);
        console.log(`Total Mislabeled: ${totalMislabeled} / ${totalImages}`);
    }
}

async function trainModel() {
    await data.loadTrainingData(Model.decapitatedMobilenet);
    console.log("Loaded Training Data");

    if (data.dataset.images) {
        const trainingParams = {
            batchSizeFraction: args.batch_size_fraction,
            denseUnits: args.dense_units,
            epochs: args.epochs,
            learningRate: args.learning_rate,
            trainStatus: ui.trainStatus
        };

        const labels = data.labelsAndImages.map(element => element.label);
        const trainResult = await Model.train(
            data.dataset,
            labels,
            trainingParams
        );
        console.log("Training Complete!");
        const losses = trainResult.history.loss;
        console.log(
            `Final Loss: ${Number(losses[losses.length - 1]).toFixed(5)}`
        );

        console.log(Model.model.summary());
    } else {
        new Error("Must load data before training the model.");
    }
}

init()
    .then(async () => {
        if (args.skip_training) return;

        console.info('first we deleted the previous models')
        await fse.emptyDir(args.model_dir)
        await trainModel();

        await Model.saveModel(args.model_dir);
    })
    .then(() => {
        testModel();
    });
