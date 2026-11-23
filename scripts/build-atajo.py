#!/usr/bin/env python3
"""Genera y firma el atajo de iOS «Finanzas» que se instala desde la web.

Uso: python3 scripts/build-atajo.py [URL_BASE]
Salida: public/atajos/Finanzas.shortcut (firmado en modo «anyone», sin secretos dentro).

El atajo pregunta la clave personal UNA vez, al importarlo (pregunta de importación),
y después envía cada notificación a URL_BASE/api/v1/transactions/auto.
La firma requiere macOS (`shortcuts sign`); por eso se hace aquí y no en el servidor.
"""
import plistlib, subprocess, sys, tempfile, os

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://finanzas-personales-omega-ruddy.vercel.app").rstrip("/")
URL = f"{BASE}/api/v1/transactions/auto"

U_CLAVE, U_HTTP, U_VALOR = "5A3C1F0E-7B2D-4C8A-9E11-1A2B3C4D5E01", "5A3C1F0E-7B2D-4C8A-9E11-1A2B3C4D5E02", "5A3C1F0E-7B2D-4C8A-9E11-1A2B3C4D5E03"
OBJ = "￼"  # marcador de variable dentro de un texto

def texto(cadena):
    return {"Value": {"string": cadena}, "WFSerializationType": "WFTextTokenString"}

def texto_con_variables(cadena, adjuntos):
    return {"Value": {"string": cadena, "attachmentsByRange": adjuntos}, "WFSerializationType": "WFTextTokenString"}

def propiedad_transaccion(nombre):
    # Nombres internos confirmados en las tablas de WorkflowKit: «Merchant (Content Property Name)»,
    # «Amount (Content Property Name)»; clase WFWalletTransactionContentItem en el código del sistema.
    return {
        "Type": "ExtensionInput",
        "Aggrandizements": [
            {"Type": "WFCoercionVariableAggrandizement", "CoercionItemClass": "WFWalletTransactionContentItem"},
            {"Type": "WFPropertyVariableAggrandizement", "PropertyName": nombre},
        ],
    }

def item(clave, valor):
    return {"WFItemType": 0, "WFKey": texto(clave), "WFValue": valor}

def diccionario(items):
    return {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}

acciones = [
    # 0. Texto que guarda la clave; una pregunta de importación lo rellena al instalar
    {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
     "WFWorkflowActionParameters": {"UUID": U_CLAVE, "WFTextActionText": os.environ.get("ATAJO_CLAVE_EMBEBIDA", "")}},
    # 1. Envío de la notificación al servidor
    {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
     "WFWorkflowActionParameters": {
         "UUID": U_HTTP,
         "WFURL": URL,
         "WFHTTPMethod": "POST",
         "WFHTTPBodyType": "JSON",
         "ShowHeaders": True,
         "WFHTTPHeaders": diccionario([
             item("Authorization", texto_con_variables("Bearer " + OBJ, {"{7, 1}": {"OutputUUID": U_CLAVE, "Type": "ActionOutput", "OutputName": "Texto"}})),
             item("Content-Type", texto("application/json")),
         ]),
         "WFJSONValues": diccionario([
             item("texto_original", texto_con_variables(OBJ, {"{0, 1}": {"Type": "ExtensionInput"}})),
             # Con el disparador «Transacción» de Wallet, la entrada es un WFWalletTransactionContentItem:
             # como texto solo da el comercio. Se piden sus propiedades por separado (lo mismo que en el
             # iPhone es «Entrada de atajo → Tipo: Transacción → Comercio / Cantidad»).
             # Con una notificación de texto llegan vacías y el servidor las ignora.
             item("comercio", texto_con_variables(OBJ, {"{0, 1}": propiedad_transaccion("Merchant")})),
             item("monto", texto_con_variables(OBJ, {"{0, 1}": propiedad_transaccion("Amount")})),
         ]),
     }},
    # 2. Mensaje que devuelve el servidor
    {"WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
     "WFWorkflowActionParameters": {
         "UUID": U_VALOR,
         "WFDictionaryKey": "mensaje_notificacion",
         "WFGetDictionaryValueType": "Value",
         "WFInput": {"Value": {"OutputUUID": U_HTTP, "Type": "ActionOutput", "OutputName": "Contenido de URL"}, "WFSerializationType": "WFTextTokenAttachment"},
     }},
    # 3. Aviso en pantalla. Sin título propio: iOS ya pone "Finanzas" (el nombre del atajo) como
    # primera línea; si además fijamos un título aquí, sale repetido dos veces.
    {"WFWorkflowActionIdentifier": "is.workflow.actions.notification",
     "WFWorkflowActionParameters": {
         "WFNotificationActionBody": texto_con_variables(OBJ, {"{0, 1}": {"OutputUUID": U_VALOR, "Type": "ActionOutput", "OutputName": "Valor del diccionario"}}),
     }},
]

flujo = {
    "WFWorkflowClientVersion": "2900.0.1",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": [] if os.environ.get("ATAJO_CLAVE_EMBEBIDA") else [{
        "Category": "Parameter",
        "ParameterKey": "WFTextActionText",
        "ActionIndex": 0,
        "Text": "Pega tu clave de Finanzas (la web la copió al tocar Instalar). Mantén pulsado este campo y toca Pegar.",
        "DefaultValue": os.environ.get("ATAJO_CLAVE_PRUEBA", ""),  # solo para pruebas locales; el archivo público va vacío
    }],
    "WFWorkflowInputContentItemClasses": [
        "WFAppContentItem", "WFAppStoreAppContentItem", "WFArticleContentItem", "WFContactContentItem", "WFDateContentItem",
        "WFEmailAddressContentItem", "WFFolderContentItem", "WFGenericFileContentItem", "WFImageContentItem", "WFiTunesProductContentItem",
        "WFLocationContentItem", "WFDCMapsLinkContentItem", "WFAVAssetContentItem", "WFPDFContentItem", "WFPhoneNumberContentItem",
        "WFRichTextContentItem", "WFSafariWebPageContentItem", "WFStringContentItem", "WFURLContentItem",
    ],
    "WFWorkflowTypes": [],
    "WFWorkflowActions": acciones,
}

with tempfile.TemporaryDirectory() as tmp:
    sin_firmar = os.path.join(tmp, "finanzas.shortcut")
    with open(sin_firmar, "wb") as f:
        plistlib.dump(flujo, f, fmt=plistlib.FMT_BINARY)
    if os.environ.get("ATAJO_PLIST_DEBUG"):  # copia sin firmar, solo para revisar el contenido
        with open(os.environ["ATAJO_PLIST_DEBUG"], "wb") as f:
            plistlib.dump(flujo, f, fmt=plistlib.FMT_XML)
    destino = os.environ.get("ATAJO_SALIDA") or os.path.join(os.path.dirname(__file__), "..", "public", "atajos", "Finanzas.shortcut")
    # `shortcuts sign` no sobrescribe un archivo existente y no avisa: se borra antes y se exige uno nuevo
    if os.path.exists(destino):
        os.remove(destino)
    r = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", sin_firmar, "--output", destino], capture_output=True, text=True)
    if not os.path.exists(destino) or os.path.getsize(destino) < 1000:
        print("Falló la firma:", r.stdout, r.stderr[-400:]); sys.exit(1)
    print(f"atajo firmado: {os.path.normpath(destino)} ({os.path.getsize(destino)} bytes) → {URL}")
