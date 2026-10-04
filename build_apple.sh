#!/bin/bash
set -e

echo "=========================================================="
echo "🍎 COMPILACAO E ENVIO DO APP DO ENTREGADOR (APPLE STORE)"
echo "=========================================================="

# 1. Carregar caminhos de ferramentas do Mac
eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null || true)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 2. Garantir a chave privada da Apple nos locais esperados
KEY_DIR="$HOME/.private_keys"
mkdir -p "$KEY_DIR"
KEY_FILE="$KEY_DIR/AuthKey_GNCVF862P9.p8"

cat << 'EOF' > "$KEY_FILE"
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgTJxL5OlCpNhIz+as
NezPrhS68wdkOc3/sFRAfI99kDqgCgYIKoZIzj0DAQehRANCAARuj2UXxFLjeNzZ
hl+S6+PG1gXxM9TUNMtwXM7HGmqpO8dKnQuoyNiGmHHFdTkJ23saL7M/jDOc8ogm
0ChusLJa
-----END PRIVATE KEY-----
EOF
chmod 600 "$KEY_FILE"

# Criar também na pasta do projeto caso altool procure localmente
mkdir -p private_keys
cp "$KEY_FILE" private_keys/AuthKey_GNCVF862P9.p8

echo "✅ Chave da Apple configurada com sucesso em $KEY_FILE"

# 3. Limpeza de builds e caches anteriores
rm -rf ~/Library/Caches/org.swift.swiftpm
rm -rf build/App.xcarchive build/App.ipa

# 4. Criar arquivo de opcoes de exportacao para a App Store Connect
mkdir -p build
cat << 'EOF' > build/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>4YULT95XAK</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
</dict>
</plist>
EOF

echo "🔧 Sanitizando caminhos no Package.swift..."
if [ -f "ios/App/CapApp-SPM/Package.swift" ]; then
  perl -pi -e 's/\\/\//g' ios/App/CapApp-SPM/Package.swift 2>/dev/null || sed -i '' 's/\\/\//g' ios/App/CapApp-SPM/Package.swift 2>/dev/null || true
fi

echo "📦 Resolvendo pacotes do Xcode (SPM)..."
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

echo "🔨 Compilando o Release Archive (Versao 1.0.2, Build 1)..."
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  archive \
  -archivePath build/App.xcarchive \
  DEVELOPMENT_TEAM="4YULT95XAK" \
  MARKETING_VERSION="1.0.2" \
  CURRENT_PROJECT_VERSION="1" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_FILE" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

echo "📦 Exportando arquivo IPA..."
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_FILE" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

echo "🚀 Enviando IPA para App Store Connect / TestFlight..."
xcrun altool --upload-app \
  -f build/App.ipa \
  -t ios \
  --apiKey "GNCVF862P9" \
  --apiIssuer "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

echo "🎉 UPLOAD CONCLUIDO COM SUCESSO!"
