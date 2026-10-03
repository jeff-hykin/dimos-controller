{
    description = "dimos-controller: camera, costmap and keyboard teleop over zenoh-web, as a dimOS Desktop app";

    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

    outputs = { self, nixpkgs }:
        let
            systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
            forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
        in {
            packages = forAllSystems (pkgs: {
                # the vite build, served at /apps/<name>/ (deps from package-lock.json; deno.lock is for dev and CI)
                dimosApp = pkgs.buildNpmPackage {
                    pname = "dimos-controller";
                    version = "0.1.0";
                    src = self;
                    npmDepsHash = "sha256-/GZR2XpXavCEb7L7yjfiekoItagkuXnhD8g95YAoWOM=";
                    buildPhase = ''
                        runHook preBuild
                        node node_modules/vite/bin/vite.js build
                        runHook postBuild
                    '';
                    installPhase = ''
                        runHook preInstall
                        cp -r dist $out
                        runHook postInstall
                    '';
                };
            });
        };
}
