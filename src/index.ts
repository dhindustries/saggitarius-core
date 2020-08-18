import { bootstrap, IDependencyManager } from "@saggitarius/di";
import { DefinitionResolvers } from "@saggitarius/di/dist/lib";
import { IMetadataProvider, MetadataDefinitionResolver } from "@saggitarius/di-metadata";
import { IMetadataParser, MetadataParser } from "@saggitarius/metadata-parser";
import { Metadata } from "@saggitarius/metadata";
import { Typing } from "@saggitarius/typing";
import { Path } from "@saggitarius/path";
import { Env } from "@saggitarius/env";
import * as WindowsPathDriver from "@saggitarius/path/dist/driver/win32";
import * as PosixPathDriver from "@saggitarius/path/dist/driver/posix";
import { FileSystem } from "@saggitarius/filesystem/dist/lib";
import { IFileSystem } from "@saggitarius/filesystem";
import { PackageRegistry } from "@saggitarius/package";
import { PackageScanner } from "@saggitarius/package-scanner";
import * as NodeFsDriver from "@saggitarius/node-filesystem";

import { 
    ISourceLoader, 
    SourceLoader, 
    IModuleLoader, 
    ModuleLoader,
    CodeModuleLoader,
    IPathResolver, 
    StaticPathResolver, 
    IFileLoader,
    FileSystemFileLoader,
    ICodeInvoker,
    FunctionCodeInvoker
} from "@saggitarius/module-loader";

export interface IService {
    run(): Promise<void>;
    kill?(): void;
}
export namespace IService {
    export const Type = Typing.type<IService[]>("@saggitarius/core::IService");
}

export interface IInstaller {
    install(): Promise<void>;
}

export type Binder = IDependencyManager["bind"];

export type Installer = (bind: Binder) => Promise<void> | void;

@Typing.register("@saggitarius/core::MetadataParserProvider")
class MetadataParserProvider implements IMetadataProvider {
    public constructor(
        private parser: IMetadataParser,
    ) {}

    public getMetadata(type: Type): Promise<Metadata.Any> {
        return this.parser.parse(type);
    }
}

export class Bootstraper {

    protected readonly root = "$path:root";
    protected dm = bootstrap();
    protected fs: IFileSystem;
    protected packages: PackageRegistry = {};
    private installers = [];
    
    public constructor() {
        this.initLibs();
        this.initDi();
    }

    private initLibs() {
        const pathDriver = Env.isWindows() ? WindowsPathDriver : PosixPathDriver;
        pathDriver.cwd = Env.Cwd;
        if (pathDriver.env) {
            Object.assign(pathDriver.env, Env.Vars);
        }
        Path.Driver = pathDriver;
    }

    private initDi() {
        this.dm.bind(IMetadataProvider).toType(MetadataParserProvider);
        this.dm.bind(IMetadataParser).toType(MetadataParser);
        this.dm.bind(ISourceLoader).toType(SourceLoader);
        this.dm.bind(IModuleLoader).toType(ModuleLoader);
        this.dm.bind(IPathResolver).toType(StaticPathResolver);
        this.dm.bind(ICodeInvoker).toType(FunctionCodeInvoker);
        this.dm.bind(IFileLoader).toType(FileSystemFileLoader);

        this.dm.bind(IFileSystem)
            .toFactory(() => this.fs);

        this.dm.bind(PackageRegistry)
            .toFactory(() =>this.packages);

        this.dm.bind(this.root)
            .toFactory(() => this.fs.directory("."));
        
        this.dm.bind(MetadataParserProvider)
            .toClass(MetadataParserProvider)
            .withArguments([IMetadataParser]);

        this.dm.bind(MetadataParser)
            .toClass(MetadataParser)
            .withArguments([
                ISourceLoader,
            ]);

        this.dm.bind(MetadataDefinitionResolver)
            .toClass(MetadataDefinitionResolver)
            .tag(DefinitionResolvers)
            .withArguments([
                IMetadataProvider, 
                IModuleLoader,
            ]);
    
        this.dm.bind(SourceLoader)
            .toClass(SourceLoader)
            .withArguments([
                IPathResolver,
                IFileLoader,
            ]);

        this.dm.bind(ModuleLoader)
            .toClass(ModuleLoader)
            .withProperties({
                customLoader: CodeModuleLoader,
            });

        this.dm.bind(CodeModuleLoader)
            .toClass(CodeModuleLoader)
            .withArguments([
                IPathResolver,
                IFileLoader,
                ICodeInvoker,
            ]);

        this.dm.bind(StaticPathResolver)
            .toClass(StaticPathResolver)
            .withArguments([
                PackageRegistry,
            ]);

        this.dm.bind(FunctionCodeInvoker)
            .toClass(FunctionCodeInvoker)
            .withProperties({
                moduleLoader: IModuleLoader,
            });

        this.dm.bind(FileSystemFileLoader)
            .toClass(FileSystemFileLoader)
            .withArguments([
                this.root,
            ]);
    }


    public install(installer: Installer) {
        this.installers.push(installer);
    }

    protected async prepare(dm: IDependencyManager): Promise<void> {
    }

    public async start(): Promise<void> {
        const binder: Binder = this.dm.bind.bind(this.dm);
        for (const installer of this.installers) {
            const result = installer(binder);
            if (result instanceof Promise) {
                await result;
            }
        }
        const dm = await this.dm.get(IDependencyManager);
        await this.prepare(dm);
        const services = await dm.get(IService);
        if (services) {
            return Promise.all(services.map((service) => service.run()))
                .then(() => undefined)
                .catch((err) => {
                    for (const service of services) {
                        if (service["kill"]) {
                            service.kill();
                        }
                    }
                    throw err;
                });
        }
    }
}

class PackageScannerWrapper extends PackageScanner {

}

export class NodeBootstraper extends Bootstraper {
    public constructor() {
        super();
        this.initFs();
        this.initNodeDi();
    }

    private initFs() {
        this.fs = new FileSystem(NodeFsDriver, Env.Cwd, true, true, true);
    }

    private initNodeDi() {
        this.dm.bind(PackageScannerWrapper)
            .toClass(PackageScannerWrapper)
            .withArguments([
                this.root,
                PackageRegistry,
            ]);
    }

    protected async prepare(dm: IDependencyManager) {
        debugger;
        const scanner = await dm.get<PackageScanner>(PackageScannerWrapper);
        await scanner.scan();
    }
}