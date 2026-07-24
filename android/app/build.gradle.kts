import java.util.Properties

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

// 업로드 키스토어 설정. android/keystore.properties 에 두고 커밋하지 않는다.
// 이 파일이 없으면 release 서명을 건너뛰므로 다른 환경에서도 빌드는 그대로 된다.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
val hasKeystore = keystorePropsFile.exists()

android {
    namespace = "com.broodsky85.omokchallenge"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.broodsky85.omokchallenge"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (hasKeystore) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["admobAppId"] = "ca-app-pub-3940256099942544~3347511713"
            buildConfigField("String", "REWARDED_AD_UNIT_ID", "\"ca-app-pub-3940256099942544/5224354917\"")
        }
        release {
            if (hasKeystore) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            manifestPlaceholders["admobAppId"] = "ca-app-pub-7962806628383813~6236666471"
            buildConfigField("String", "REWARDED_AD_UNIT_ID", "\"ca-app-pub-7962806628383813/6058105442\"")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-ads:25.4.0")
    implementation(platform("com.google.firebase:firebase-bom:34.15.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}

val syncWebAssets by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile) {
        include("*.html")
        include("manifest.webmanifest")
        include("sw.js")
        include("icons/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/web"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
