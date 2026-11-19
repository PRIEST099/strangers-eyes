// swift-tools-version:6.2
import PackageDescription
let package = Package(
  name: "Probe12",
  platforms: [.iOS("27.0")],
  products: [.library(name: "Probe12", targets: ["Probe12"])],
  dependencies: [
    .package(url: "https://github.com/firebase/firebase-ios-sdk", exact: "12.19.3"),
  ],
  targets: [
    .target(name: "Probe12", dependencies: [
      .product(name: "FirebaseAILogic", package: "firebase-ios-sdk"),
      .product(name: "FirebaseAppCheck", package: "firebase-ios-sdk"),
      .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
      .product(name: "FirebaseRemoteConfig", package: "firebase-ios-sdk"),
    ]),
  ]
)
