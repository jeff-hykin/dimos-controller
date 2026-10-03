{
    description = "dimos-controller: drive a dimos robot and watch its camera and costmap, as a dimOS Desktop app (`nix build .#dimosApp`)";
    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    nixConfig = {
        extra-substituters = [ "https://dimos-desktop.cachix.org" ];
        extra-trusted-public-keys = [ "dimos-desktop.cachix.org-1:A4P35aGJGmCan92LWyamtSFXMqaVE+VRFYnrJ8QMTeQ=" ];
    };
    outputs = { self, nixpkgs }:
        let
            systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
            forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
        in {
            packages = forAll (pkgs: rec {
                frontend = pkgs.buildNpmPackage {
                    pname = "dimos-controller-frontend";
                    version = "0.1.0";
                    src = ./frontend;
                    # `nix build .#frontend` prints the right hash when package-lock.json changes
                    npmDepsHash = "sha256-pr/PTVVu5IBNFtlWrixmwhgu+5Vu3wB99J3TPdsK4e8=";
                    installPhase = "cp -r dist $out";
                };
                dimosApp = pkgs.writeShellScriptBin "dimos-app-server" ''
                    exec ${pkgs.deno}/bin/deno run -A --no-lock ${./backend}/main.ts --frontend ${frontend} "$@"
                '';
                default = dimosApp;
            });
        };
}
