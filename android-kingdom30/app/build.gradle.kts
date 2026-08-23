import java.util.Properties

plugins {
    id("com.android.application")
}

// 업로드 키스토어 설정. android-kingdom30/keystore.properties 에 두고 커밋하지 않는다.
// 이 파일이 없으면 release 서명을 건너뛰므로 다른 환경에서도 빌드는 그대로 된다.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
val hasKeystore = keystorePropsFile.exists()

android {
    namespace = "com.broodsky85.kingdom30"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.broodsky85.kingdom30"
        minSdk = 23
        targetSdk = 36
        // Play에 올린 versionCode는 두 번 못 쓴다. 새 빌드를 올릴 때마다 1씩 올릴 것.
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
        release {
            if (hasKeystore) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
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
    implementation("androidx.activity:activity:1.13.0")
}

// kingdom30.html은 외부 참조가 없는 단일 파일이다. 이거 하나만 넣는다.
// 다른 게임 HTML이나 웹 홈은 이 앱에 들어가지 않는다.
val syncWebAssets by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile) {
        include("kingdom30.html")
    }
    into(layout.projectDirectory.dir("src/main/assets/web"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
