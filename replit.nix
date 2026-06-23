{pkgs}: {
  deps = [
    pkgs.gtk3
    pkgs.at-spi2-atk
    pkgs.alsa-lib
    pkgs.cairo
    pkgs.pango
    pkgs.xorg.libXtst
    pkgs.xorg.libXi
    pkgs.xorg.libXcursor
    pkgs.xorg.libXrandr
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.cups
    pkgs.atk
    pkgs.nss
    pkgs.chromium
  ];
}
