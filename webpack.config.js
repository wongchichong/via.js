// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const isProduction = process.env.NODE_ENV == 'production'


const config = {
    entry: {
        controller: { import: './src/via/controller/index.ts', filename: 'controller.js' },
        receiver: { import: './src/via/receiver/index.ts', filename: 'receiver.js' },

        domWorker: { import: './src/demos/dom-in-worker/worker.tsx', filename: './dom-in-worker/worker.js' },
        domWorkerIndex: { import: './src/demos/dom-in-worker/index.ts', filename: './dom-in-worker/index.js' },
        workerCalls: { import: './src/demos/worker-calls/worker.ts', filename: './worker-calls/worker.js' },
        workerCallsIndex: { import: './src/demos/worker-calls/index.ts', filename: './worker-calls/index.js' },
    },
    output: {
        publicPath: '',
        path: path.resolve(__dirname, 'dist'),
    },
    devServer: {
        open: true,
        host: 'localhost',
    },
    devtool: false, //'cheap-module-source-map',

    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
            chunks: [],
        }),

        new HtmlWebpackPlugin({
            filename: '/dom-in-worker/index.html',
            template: 'src/demos/dom-in-worker/index.html',
            chunks: [],
        }),

        new HtmlWebpackPlugin({
            filename: '/worker-calls/index.html',
            template: 'src/demos/worker-calls/index.html',
            chunks: [],
        }),

        // Add your plugins here
        // Learn more about plugins from https://webpack.js.org/configuration/plugins/
    ],
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/'],
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            },

            // Add your rules for custom modules here
            // Learn more about loaders from https://webpack.js.org/loaders/
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
    },
}

module.exports = () => {
    if (isProduction) {
        config.mode = 'production'


    } else {
        config.mode = 'development'
    }
    return config
}
