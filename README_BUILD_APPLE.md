# Guia de Compilação e Envio 100% via Linha de Comando no Mac (Apple Store / TestFlight)

Este documento contém os scripts automatizados prontos para copiar e colar no Terminal do Mac (RentAMac / Mac mini), sem precisar abrir o Xcode ou nenhuma interface gráfica.

---

## 🔑 Credenciais da Apple no Mac (Já configuradas)
- **Team ID:** `4YULT95XAK`
- **Key ID:** `GNCVF862P9`
- **Issuer ID:** `b3214eff-b69b-4b7a-bfd0-0c476ed2605c`
- **Chave Privada:** `~/.private_keys/AuthKey_GNCVF862P9.p8`

---

## 📱 1. CLIENTE (MT 24 Horas)
> **Bundle ID:** `com.mt24horasexpress.cliente`

Copie e cole este bloco completo no terminal do Mac:

```bash
cd ~/Documents
if [ ! -d "cliente-primavera" ]; then
  git clone https://github.com/PVADelivery/cliente-primavera.git
fi
cd cliente-primavera
git pull origin main
npm install --legacy-peer-deps

mkdir -p build
cat << 'EOF' > build/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>4YULT95XAK</string>
    <key>manageAppVersionAndBuildNumber</key>
    <true/>
</dict>
</plist>
EOF

rm -rf ~/Library/Caches/org.swift.swiftpm
rm -rf build/App.xcarchive build/App.ipa

xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  archive \
  -archivePath build/App.xcarchive \
  DEVELOPMENT_TEAM="4YULT95XAK" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcrun altool --upload-app \
  -f build/App.ipa \
  -t ios \
  --apiKey "GNCVF862P9" \
  --apiIssuer "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"
```

---

## 🏍️ 2. ENTREGADOR (MT 24 Horas Express - Entregador)
> **Bundle ID:** `com.mt24horasexpress.entregador`

Copie e cole este bloco completo no terminal do Mac:

```bash
cd ~/Documents
if [ ! -d "entrega-primavera" ]; then
  git clone https://github.com/PVADelivery/entrega-primavera.git
fi
cd entrega-primavera
git pull origin main
npm install --legacy-peer-deps

mkdir -p build
cat << 'EOF' > build/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>4YULT95XAK</string>
    <key>manageAppVersionAndBuildNumber</key>
    <true/>
</dict>
</plist>
EOF

rm -rf ~/Library/Caches/org.swift.swiftpm
rm -rf build/App.xcarchive build/App.ipa

xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  archive \
  -archivePath build/App.xcarchive \
  DEVELOPMENT_TEAM="4YULT95XAK" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcrun altool --upload-app \
  -f build/App.ipa \
  -t ios \
  --apiKey "GNCVF862P9" \
  --apiIssuer "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"
```

---

## 🏬 3. LOJISTA (MT 24 Horas Express - Lojista)
> **Bundle ID:** `com.mt24horasexpress.lojista`

Copie e cole este bloco completo no terminal do Mac:

```bash
cd ~/Documents
if [ ! -d "lojista-primavera" ]; then
  git clone https://github.com/PVADelivery/lojista-primavera.git
fi
cd lojista-primavera
git pull origin main
npm install --legacy-peer-deps

mkdir -p build
cat << 'EOF' > build/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>4YULT95XAK</string>
    <key>manageAppVersionAndBuildNumber</key>
    <true/>
</dict>
</plist>
EOF

rm -rf ~/Library/Caches/org.swift.swiftpm
rm -rf build/App.xcarchive build/App.ipa

xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj

xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  archive \
  -archivePath build/App.xcarchive \
  DEVELOPMENT_TEAM="4YULT95XAK" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.private_keys/AuthKey_GNCVF862P9.p8" \
  -authenticationKeyID "GNCVF862P9" \
  -authenticationKeyIssuerID "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"

xcrun altool --upload-app \
  -f build/App.ipa \
  -t ios \
  --apiKey "GNCVF862P9" \
  --apiIssuer "b3214eff-b69b-4b7a-bfd0-0c476ed2605c"
```

---

## 🚀 Resumo do que o script faz:
1. Puxa as alterações mais recentes do GitHub (`git pull origin main`).
2. Garante as dependências locais (`npm install`).
3. Limpa caches antigos do Swift Package Manager (`org.swift.swiftpm`).
4. Resolve os pacotes SPM nativos do Capacitor (`xcodebuild -resolvePackageDependencies`).
5. Compila o `.xcarchive` assinado com provisionamento automático da Apple.
6. Exporta o arquivo `.ipa` de distribuição App Store.
7. Faz o upload direto para o TestFlight / App Store Connect usando o `altool`.
