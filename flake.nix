{
  description = "Development shell for todo web, Firebase, and Android tooling";

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
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };
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
