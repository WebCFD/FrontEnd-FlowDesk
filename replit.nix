{pkgs}: {
  deps = [
    pkgs.e2fsprogs
    pkgs.krb5
    pkgs.xorg.libXi
    pkgs.xorg.libXinerama
    pkgs.xorg.libXcursor
    pkgs.xorg.libXrender
    pkgs.libGLU
    pkgs.mesa
    pkgs.imagemagick
    pkgs.postgresql
  ];
}
