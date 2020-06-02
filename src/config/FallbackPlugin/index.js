/* eslint-disable */
/**
 * ScandiPWA - Progressive Web App for Magento
 *
 * Copyright © Scandiweb, Inc. All rights reserved.
 * See LICENSE for license details.
 *
 * @license OSL-3.0 (Open Software License ("OSL") v. 3.0)
 * @package scandipwa/base-theme
 * @link https://github.com/scandipwa/base-theme
 */

// This is Webpack plugin, which fallbacks files which does not exist. Bellow is the fallback sequence:
// 1. The file is checked in app/design (later referenced as `custom`) folder
// 2. The file is checked in vendor (later referenced as `core`) folder
// 3. The file is checked in node_modules of app/design (later referenced as `node`) folder

const path = require('path');
const fs = require('fs');

class FallbackPlugin {
    constructor(options) {
        this.options = Object.assign(FallbackPlugin.defaultOptions, options);
        this.parentThemeRegExp = this.buildParentThemeRegExp();
    }

    buildParentThemeRegExp() {
        const relativeToAdf = this.options.parentRoot.split('app/design/frontend')[1];
        const [vendor, themeName] = relativeToAdf.split('/');

        return new RegExp(`/${vendor}/${themeName}/`);
    }

    // Default plugin entry-point function
    apply(resolver) {
        resolver.getHook('resolve').tapAsync('FallbackPlugin', (request, resolveContext, callback) => {
            // Determine if request is coming from core file
            const pathIsCore = !!request.path.match(/vendor/);

            // Determine if the request is child-of-a-child node_module request
            const pathIsNode = !!request.path.match(/node_modules/);

            // Determine if the request is coming from parent file
            const pathIsParent = !!request.path.match(this.parentThemeRegExp);

            // Determine if the request is coming from custom file
            const pathIsCustom = !!request.path.match(/app\/design\/frontend\/Scandiweb\/pwa\//);

            // Determine if request is coming to core file
            const requestIsCore = !!request.request.match(/vendor/);

            // Determine if request is coming to custom file
            const requestIsCustom = !!request.request.match(/app\/design\/frontend\/Scandiweb\/pwa\//);

            // Determine if request is coming to parent theme file
            const requestIsParent = !!request.request.match(this.parentThemeRegExp);

            // Determine if request is coming to plugin file
            const requestAbsolute = path.resolve(request.path, request.request);
            const requestIsPlugin = !!requestAbsolute.match(/\/src\/scandipwa\//);

            // Check if request can be handled
            if (!request.path || !request.request) return callback();

            // Construct expected path to resolved file from any theme root
            // * Get path relative to corresponding root
            const expectedRoot = (() => {
                if (requestIsPlugin) {
                    const pluginRoot = requestAbsolute.split('/src/scandipwa/')[0];
                    const pluginFrontendRoot = path.join(pluginRoot, 'src', 'scandipwa');

                    return pluginFrontendRoot;
                }

                if (!pathIsParent) {
                    return (pathIsCore && !requestIsCustom)
                        ? this.options.fallbackRoot
                        : this.options.projectRoot;
                } else {
                    return (pathIsParent && !requestIsCustom)
                        ? this.options.parentRoot
                        : this.options.projectRoot;
                }
            })()


            // Construct expected path to resolved file from any theme root
            const expected = requestIsCore
                ? request.request.split('vendor/scandipwa/source/')[1]
                : path.relative(expectedRoot, path.resolve(request.path, request.request));

            // Function which passes request modifying path
            const proceed = (from, options) => {
                const newRequest = Object.assign({}, request);

                switch (from) {
                // ** Core / custom fallbacks **
                // From custom to core
                case 'custom-to-core':
                    newRequest.path = path.resolve(
                        this.options.fallbackRoot,
                        path.relative(this.options.projectRoot, request.path)
                    );
                    break;

                // From core to custom
                case 'core-to-custom':
                    newRequest.path = path.resolve(
                        this.options.projectRoot,
                        path.relative(this.options.fallbackRoot, request.path)
                    );
                    break;

                // From core to core
                case 'core-to-core':
                    newRequest.request = path.relative(
                        request.path,
                        path.resolve(
                            this.options.fallbackRoot,
                            path.relative(
                                this.options.projectRoot,
                                path.resolve(request.path, request.request)
                            )
                        )
                    );

                    // If string does not start with `/` or `./` then append relative path
                    if (!newRequest.request.match(/^(.\/|\/)/)) {
                        newRequest.request = `./${newRequest.request}`;
                    }
                    break;

                // From core to custom node_modules
                case 'core-to-node':
                    newRequest.path = path.resolve(
                        path.resolve(this.options.projectRoot, 'node_modules'),
                        path.relative(this.options.fallbackRoot, request.path)
                    );
                    break;


                // ** Parent theme implementation **
                // From core to parent theme
                case 'core-to-parent':
                    newRequest.path = path.resolve(
                        this.options.parentRoot,
                        path.relative(this.options.fallbackRoot, request.path)
                    );
                    break;

                // From parent theme to core
                case 'parent-to-core':
                    newRequest.path = path.resolve(
                        this.options.fallbackRoot,
                        path.relative(this.options.parentRoot, request.path)
                    );
                    break;

                // From custom to parent theme
                case 'custom-to-parent':
                    newRequest.path = path.resolve(
                        this.options.parentRoot,
                        path.relative(this.options.projectRoot, request.path)
                    );
                    break;

                // From parent theme to custom
                case 'parent-to-custom':
                    newRequest.path = path.resolve(
                        this.options.projectRoot,
                        path.relative(this.options.parentRoot, request.path)
                    );
                    break;

                // Transform request to require file from parent instead of explicitly referenced core
                case 'req-core-to-parent':
                    newRequest.request = path.relative(
                        request.path,
                        path.resolve(
                            this.options.parentRoot,
                            expected
                        )
                    );
                    break;

                // ** Plugins' fallbacks **
                // From plugin to custom
                case 'req-plugin-to-custom':
                    const { customPath } = options;
                    newRequest.request = customPath;
                    break;

                // From plugin to parent theme
                case 'req-plugin-to-parent':
                    const { parentPath } = options;
                    newRequest.request = parentPath;
                    break;

                default:
                    return callback();
                }

                // If requests are not similar modify request (recursion prevention)
                if (JSON.stringify(request) === JSON.stringify(newRequest)) {
                    return callback();
                }

                return resolver.doResolve(
                    resolver.hooks.resolve,
                    newRequest,
                    'Resolving with fallback!',
                    resolveContext,
                    callback
                );
            };

            const constructPath = (root) => {
                if (!requestIsPlugin) {
                    return path.resolve(root, expected);
                }

                // Plugin files require other plugin files
                const exploded = requestAbsolute.split('/src/scandipwa/')[0].split('/');
                const vendorName = exploded[exploded.length - 2];
                const pluginName = exploded[exploded.length - 1];

                // Handle requires like 'babel-plugin-...'
                if (!root || !vendorName || !pluginName || !expected) {
                    return path.resolve(root, expected);
                }
                return path.resolve(root, 'src/app/plugin', vendorName, pluginName, expected);
            }

            const customPath = constructPath(this.options.projectRoot);
            const customExists = this.fileExists(customPath);

            const parentPath = constructPath(this.options.parentRoot);
            const parentExists = this.fileExists(parentPath);

            if (pathIsCustom && requestIsCore && parentExists) {
                return proceed('req-core-to-parent');
            }

            // If custom exists and initial path is core - replace path, else return as is.
            if (customExists) {
                if (requestIsPlugin) return proceed('req-plugin-to-custom', { customPath });
                if (pathIsCore) return proceed('core-to-custom');
                if (pathIsParent && !requestIsCore) return proceed('parent-to-custom');
                return callback();
            }

            // If parent exists and initial path is core or custom - replace path, else return as is.
            if (parentExists) {
                if (requestIsPlugin) return proceed('req-plugin-to-parent', { parentPath });
                if (pathIsCustom) return proceed('custom-to-parent');
                if (pathIsCore) return proceed('core-to-parent');
                return callback();
            }

            const corePath = path.resolve(this.options.fallbackRoot, expected);
            const coreExists = this.fileOrFolderExists(corePath);

            // If core exists and initial path is core - return as is, else replace path.
            if (coreExists) {
                if (pathIsCore && !requestIsCustom && !requestIsParent) return callback();
                if (requestIsCustom) return proceed('core-to-core');
                if (requestIsParent) return proceed('parent-to-core');
                return proceed('custom-to-core');
            }

            const nodeOrigin = path.resolve(this.options.projectRoot, 'node_modules');
            const nodePath = path.resolve(nodeOrigin, request.request);
            const nodeExists = this.fileOrFolderExists(nodePath);

            // If node module exists and not a dependancy
            if (nodeExists) {
                if (pathIsCore && !pathIsNode) {
                    return proceed('core-to-node');
                }

                return callback();
            }

            return callback();
        });
    }

    // Function which checks for Folder or JS file
    fileOrFolderExists(path) {
        return fs.existsSync(path) || fs.existsSync(`${path}.js`) || fs.existsSync(`${path}.scss`);
    }

    // Function which checks for file
    fileExists(path) {
        return (path.match(/\.scss/) && fs.existsSync(path))
            || fs.existsSync(`${path}/index.js`)
            || fs.existsSync(`${path}.js`)
            || fs.existsSync(`${path}.scss`);
    }
}

FallbackPlugin.defaultOptions = {
    fallbackRoot: '',
    parentRoot: ''
};

module.exports = FallbackPlugin;
