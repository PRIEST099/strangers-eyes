import Foundation
import CoreLocation
import ImageIO
import UniformTypeIdentifiers
import SwiftUI
import PhotosUI
import CoreImage
import CoreImage.CIFilterBuiltins

@MainActor func oneShotLocation() async throws -> CLLocation? {
  let session = CLServiceSession(authorization: .whenInUse)
  defer { session.invalidate() }
  for try await update in CLLocationUpdate.liveUpdates() {
    if update.authorizationDenied || update.authorizationDeniedGlobally { return nil }
    if let loc = update.location, loc.horizontalAccuracy >= 0, loc.horizontalAccuracy < 100 { return loc }
  }
  return nil
}

final class OneShot: NSObject, CLLocationManagerDelegate {
  let m = CLLocationManager()
  var cont: CheckedContinuation<CLLocation, Error>?
  func get() async throws -> CLLocation {
    m.delegate = self; m.desiredAccuracy = kCLLocationAccuracyBest
    if m.authorizationStatus == .notDetermined { m.requestWhenInUseAuthorization() }
    return try await withCheckedThrowingContinuation { c in cont = c; m.requestLocation() }
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { if let l = locations.last { cont?.resume(returning: l); cont = nil } }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { cont?.resume(throwing: error); cont = nil }
}

func strip(_ src: CGImageSource) -> Data? {
  let out = NSMutableData()
  guard let type = CGImageSourceGetType(src), let dest = CGImageDestinationCreateWithData(out, type, 1, nil) else { return nil }
  let opts: [CFString: Any] = [
    kCGImageDestinationMetadata: CGImageMetadataCreateMutable(),
    kCGImageMetadataShouldExcludeGPS: true,
    kCGImageMetadataShouldExcludeXMP: true,
    kCGImagePropertyOrientation: NSNull(),
  ]
  var err: Unmanaged<CFError>?
  _ = CGImageDestinationCopyImageSource(dest, src, opts as CFDictionary, &err)
  return out as Data
}

func mask(_ ci: CIImage, rect: CGRect) -> CIImage {
  let fill = CIImage(color: .black).cropped(to: rect)
  return fill.composited(over: ci)
}

struct Picker: View {
  @State var item: PhotosPickerItem?
  var body: some View { PhotosPicker("Pick", selection: $item, matching: .images) }
}
