/**
 * This module contains the [[DefaultVizualizer]] class, which is the default
 * entry point of the code.
 *
 * The default vizualization is organized around four panels: the
 * [[MetadataPanel|metadata]] panel; the [[PropertiesMap|map]] (a scatter plot of
 * properties), the [[StructureViewer|structure viewer]], and the general
 * dataset [[EnvironmentInfo|information]]. Each one of these is defined in a
 * separate module.
 *
 * Other organization of the vizualization are possible by using the classes
 * responsible for each sub-panel separately, instead of using the
 * [[DefaultVizualizer]]. In this case, users should make sure to finish the
 * plumbing by setting the right callbacks on each element used.
 *
 * @packageDocumentation
 * @module main
 * @preferred
 */

import {EnvironmentInfo} from './info';
import {PropertiesMap} from './map';
import {MetadataPanel} from './metadata';
import {StructureViewer} from './structure';

import {checkDataset, Dataset, Structure} from './dataset';
import {addWarningHandler, EnvironmentIndexer} from './utils';

// tslint:disable-next-line: no-var-requires
require('./static/chemiscope.css');

/**
 * Configuration for the [[DefaultVizualizer]]
 */
export interface Config {
    /** Id of the DOM element to use for the [[MetadataPanel|metadata display]] */
    meta: string;
    /** Id of the DOM element to use for the [[PropertiesMap|map]] */
    map: string;
    /** Id of the DOM element to use for the [[EnvironmentInfo|environment information]] */
    info: string;
    /** Id of the DOM element to use for the [[StructureViewer|structure viewer]] */
    structure: string;
    /** Path of j2s files, used by JSmol, which is used by the [[StructureViewer|structure viewer]] */
    j2sPath: string;
    /** Custom structure loading callback, used to set [[StructureViewer.loadStructure]] */
    loadStructure?: (index: number, structure: any) => Structure;
}

/** @hidden
 * Check if `o` contains all the expected fields to be a [[Config]].
 */
function checkConfig(o: any) {
    if (!('meta' in o && typeof o.meta === 'string')) {
        throw Error('missing "meta" key in chemiscope config');
    }

    if (!('map' in o && typeof o.map === 'string')) {
        throw Error('missing "map" key in chemiscope config');
    }

    if (!('info' in o && typeof o.info === 'string')) {
        throw Error('missing "info" key in chemiscope config');
    }

    if (!('structure' in o && typeof o.structure === 'string')) {
        throw Error('missing "structure" key in chemiscope config');
    }

    if (!('j2sPath' in o && typeof o.j2sPath === 'string')) {
        throw Error('missing "j2sPath" key in chemiscope config');
    }

    // from underscore.js / https://stackoverflow.com/a/6000016
    const isFunction = (obj: any) => {
        return !!(obj && obj.constructor && obj.call && obj.apply);
    };

    if ('loadStructure' in o && !isFunction(o.loadStructure)) {
        throw Error('"loadStructure" should be a function in chemiscope config');
    }
}

/**
 * The default vizualization state of chemiscope: three panels (map, structure,
 * info) updating one another when the user interact with any of them.
 */
class DefaultVizualizer {
    /**
     * Load a dataset and create a vizualizer.
     *
     * This function returns a `Promise<DefaultVizualizer>` to prevent blocking
     * the browser while everything is loading.
     *
     * @param  config  configuration of the vizualizer
     * @param  dataset dataset to load
     * @return         Promise that resolves to a [[DefaultVizualizer]]
     */
    public static load(config: Config, dataset: Dataset): Promise<DefaultVizualizer> {
        return new Promise((resolve, _) => {
            const visualizer = new DefaultVizualizer(config, dataset);
            resolve(visualizer);
        });
    }

    public map: PropertiesMap;
    public info: EnvironmentInfo;
    public meta: MetadataPanel;
    public structure: StructureViewer;

    private _ids: {
        map: string;
        meta: string;
        info: string;
        structure: string;
    };
    private _indexer: EnvironmentIndexer;

    // the constructor is private because the main entry point is the static
    // `load` function
    private constructor(config: Config, dataset: Dataset) {
        checkConfig(config);
        checkDataset(dataset);

        this._ids = config;
        const mode = (dataset.environments === undefined) ? 'structure' : 'atom';
        this._indexer = new EnvironmentIndexer(mode, dataset.structures, dataset.environments);

        this.meta = new MetadataPanel(config.meta, dataset.meta);

        this.map = new PropertiesMap(config.map, this._indexer, dataset.properties);
        this.structure = new StructureViewer(
            config.structure,
            config.j2sPath,
            this._indexer,
            dataset.structures,
            dataset.environments,
        );

        if (config.loadStructure !== undefined) {
            this.structure.loadStructure = config.loadStructure;
        }

        this.structure.onselect = (indexes) => {
            this.map.select(indexes);
            this.info.show(indexes);
        };

        this.info = new EnvironmentInfo(config.info, dataset.properties, this._indexer);
        this.info.onchange = (indexes) => {
            this.map.select(indexes);
            this.structure.show(indexes);
        };
        this.info.startStructurePlayback = (advance) => this.structure.structurePlayback(advance);
        this.info.startAtomPlayback = (advance) => this.structure.atomPlayback(advance);

        this.map.onselect = (indexes) => {
            this.info.show(indexes);
            this.structure.show(indexes);
        };

        const initial = {environment: 0, structure: 0, atom: 0};
        this.structure.show(initial);
        this.info.show(initial);
        this.map.select(initial);
    }

    /**
     * Change the loaded dataset in an existing vizualizer.
     *
     * This function returns a `Promise` to prevent blocking the browser while
     * everything is loading.
     *
     * @param  dataset dataset to load
     * @return         Promise that resolves when everything is loaded
     */
    public changeDataset(dataset: Dataset): Promise<void> {
        return new Promise((resolve, _) => {
            checkDataset(dataset);

            const mode = (dataset.environments === undefined) ? 'structure' : 'atom';
            this._indexer = new EnvironmentIndexer(mode, dataset.structures, dataset.environments);

            this.meta.changeDataset(dataset.meta);

            this.map.changeDataset(this._indexer, dataset.properties);
            this.structure.changeDataset(this._indexer, dataset.structures, dataset.environments);
            this.structure.onselect = (indexes) => {
                this.map.select(indexes);
                this.info.show(indexes);
            };

            this.info = new EnvironmentInfo(this._ids.info, dataset.properties, this._indexer);
            this.info.onchange = (indexes) => {
                this.map.select(indexes);
                this.structure.show(indexes);
            };
            this.info.startStructurePlayback = (advance) => this.structure.structurePlayback(advance);
            this.info.startAtomPlayback = (advance) => this.structure.atomPlayback(advance);

            this.map.onselect = (indexes) => {
                this.info.show(indexes);
                this.structure.show(indexes);
            };

            const initial = {environment: 0, structure: 0, atom: 0};
            this.structure.show(initial);
            this.info.show(initial);
            this.map.select(initial);
            resolve();
        });
    }
}

export {
    addWarningHandler,
    MetadataPanel,
    PropertiesMap,
    StructureViewer,
    EnvironmentInfo,
    EnvironmentIndexer,
    DefaultVizualizer,
};
