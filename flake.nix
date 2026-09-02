{
  description = "Todo application, local CLI, and development tools";

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
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };
      todoCliFor =
        system:
        let
          pkgs = pkgsFor system;
          cliSource = nixpkgs.lib.fileset.toSource {
            root = ./.;
            fileset = nixpkgs.lib.fileset.unions [
              ./cli
              ./src/lib/redux.ts
              ./src/lib/components/auth.ts
              ./src/lib/components/items.ts
              ./src/lib/components/labels.ts
              ./src/lib/components/lists.ts
              ./src/lib/components/requests.ts
              ./tsconfig.json
            ];
          };
          runtimePath = nixpkgs.lib.makeBinPath (
            nixpkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
              pkgs.libsecret
              pkgs.xdg-utils
            ]
          );
        in
        pkgs.buildNpmPackage {
          pname = "todo-cli";
          version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
          src = cliSource;
          npmRoot = "cli";
          npmDeps = pkgs.fetchNpmDeps {
            src = cliSource;
            sourceRoot = "source/cli";
            hash = "sha256-ZzulsT0g9j0iONWnHuH4CxyS3o+LzWn7F9KucSYcBDk=";
          };
          nativeBuildInputs = [
            pkgs.bun
            pkgs.makeWrapper
          ];
          dontNpmBuild = true;

          buildPhase = ''
            runHook preBuild
            ln -s cli/node_modules node_modules
            bun build cli/src/cli.ts cli/src/service.ts --target=bun --outdir=dist
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out/bin" "$out/share/todo-cli"
            cp dist/cli.js dist/service.js "$out/share/todo-cli/"
            makeWrapper ${pkgs.bun}/bin/bun "$out/bin/todo" \
              --add-flags "$out/share/todo-cli/cli.js" \
              --set TODO_CLI_SERVICE_ENTRYPOINT "$out/share/todo-cli/service.js" \
              ${nixpkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''--prefix PATH : "${runtimePath}"''}
            runHook postInstall
          '';

          meta = {
            description = "Command-line client and resident service for Todo";
            homepage = "https://github.com/anicolao/todo";
            license = nixpkgs.lib.licenses.gpl3Only;
            mainProgram = "todo";
            platforms = systems;
          };
        };
    in
    {
      packages = forAllSystems (system: {
        default = todoCliFor system;
        todo = todoCliFor system;
      });

      apps = forAllSystems (
        system:
        let
          todo = todoCliFor system;
        in
        {
          default = {
            type = "app";
            program = "${todo}/bin/todo";
            meta.description = "Run the Todo command-line client";
          };
          todo = {
            type = "app";
            program = "${todo}/bin/todo";
            meta.description = "Run the Todo command-line client";
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          emulatorAbi = if pkgs.stdenv.hostPlatform.isAarch64 then "arm64-v8a" else "x86_64";
          androidComposition = pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ "36" ];
            buildToolsVersions = [ "35.0.0" ];
            includeEmulator = true;
            includeSystemImages = true;
            systemImageTypes = [ "google_apis" ];
            abiVersions = [ emulatorAbi ];
            includeCmake = false;
            includeNDK = false;
          };
          androidSdk = androidComposition.androidsdk;
        in
        {
          default = pkgs.mkShell {
            packages = [
              androidSdk
              pkgs.bashInteractive
              pkgs.coreutils
              pkgs.git
              pkgs.google-cloud-sdk
              pkgs.jdk21
              pkgs.nodejs_22
            ];

            ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
            ANDROID_SDK_ROOT = "${androidSdk}/libexec/android-sdk";
            ANDROID_EMULATOR_ABI = emulatorAbi;
            ANDROID_EMULATOR_IMAGE = "system-images;android-36;google_apis;${emulatorAbi}";
            JAVA_HOME = pkgs.jdk21.home;

            shellHook = ''
              export ANDROID_USER_HOME="$PWD/.android"
              export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
              export GRADLE_OPTS="''${GRADLE_OPTS:+$GRADLE_OPTS }-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/35.0.0/aapt2"
              if [ -d android ]; then
                printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
              fi
              echo "todo dev shell: npm ci, npm run android:build, npm run android:test:emulator, or npm run playwright"
            '';
          };
        }
      );
    };
}
