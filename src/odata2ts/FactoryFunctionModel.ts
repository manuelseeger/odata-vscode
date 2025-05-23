import { DataModel } from "./data-model/DataModel";
import { Schema } from "./data-model/edmx/ODataEdmxModelBase";
import { NamingHelper } from "./data-model/NamingHelper";
import { RunOptions } from "./OptionModel";
//import { ProjectManager } from "./project/ProjectManager.js";

export type DigestionOptions = Pick<
    RunOptions,
    | "converters"
    | "disableAutoManagedKey"
    | "propertiesByName"
    | "byTypeAndName"
    | "v2ModelsWithExtraResultsWrapping"
    | "v4BigNumberAsString"
    | "skipEditableModels"
    | "skipComments"
    | "disableAutomaticNameClashResolution"
    | "bundledFileGeneration"
    | "numericEnums"
>;

/**
 * Takes an EdmxSchema plus the run options and creates a DataModel.
 */
export type DigesterFunction<S extends Schema<any, any>> = (
    schema: Array<S>,
    options: DigestionOptions,
    namingHelper: NamingHelper,
) => Promise<DataModel>;

export type GeneratorFunctionOptions = Pick<
    RunOptions,
    | "skipEditableModels"
    | "skipIdModels"
    | "skipOperations"
    | "skipComments"
    | "v2ModelsWithExtraResultsWrapping"
    | "numericEnums"
>;

// export type EntityBasedGeneratorFunction = (
//   project: ProjectManager,
//   dataModel: DataModel,
//   version: ODataVersions,
//   options: GeneratorFunctionOptions,
//   namingHelper: NamingHelper,
// ) => Promise<void>;
