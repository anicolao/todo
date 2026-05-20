{
  description = "Development shell for todo Firebase deployment tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bashInteractive
              coreutils
              git
              google-cloud-sdk
              nodejs_22
            ];

            shellHook = ''
              echo "todo dev shell: run npm ci, then npm run deploy:preflight -- path/to/service-account.json"
            '';
          };
        }
      );
    };
}
