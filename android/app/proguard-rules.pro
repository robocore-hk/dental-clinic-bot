# temi SDK serialises over AIDL and parses map JSON with Gson.
-keep class com.robotemi.sdk.** { *; }
-dontwarn com.robotemi.sdk.**
-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

-keep class com.google.zxing.** { *; }
-dontwarn com.google.zxing.**
