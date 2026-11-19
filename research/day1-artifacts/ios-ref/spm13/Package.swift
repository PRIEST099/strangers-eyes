// swift-tools-version:6.2
import PackageDescription
let package = Package(
  name: "Probe13",
  platforms: [.iOS("27.0")],
  products: [.library(name: "Probe13", targets: ["Probe13"])],
  dependencies: [
    .package(url: "https://github.com/firebase/firebase-ios-sdk", exact: "13.2.0"),
  ],
  targets: [
    .target(name: "Probe13", dependencies: [
      .product(name: "FirebaseAILogic", package: "firebase-ios-sdk"),
      .product(name: "FirebaseAppCheck", package: "firebase-ios-sdk"),
      .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
      .product(name: "FirebaseRemoteConfig", package: "firebase-ios-sdk"),
    ]),
  ]
)
