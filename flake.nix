{
    description = "dimos-controller: camera, costmap and keyboard teleop over zenoh-web, as a dimOS Desktop app";

    # unstable for a deno that reads deno.lock v5 (25.05 ships 2.2)
    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    outputs = { self, nixpkgs }:
        let
            systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
            forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
        in {
            apps = forAllSystems (pkgs: {
                install = {
                    type = "app";
                    # the vite build Desktop serves: dist/ (not committed)
                    program = toString (pkgs.writeShellScript "install" ''
                        set -e
                        ${pkgs.deno}/bin/deno install --frozen
                        ${pkgs.deno}/bin/deno task build
                        test -f dist/index.html
                    '');
                };
            });
        };
}
